(function() {
  'use strict';

  const dateFormat = "DD.MM.YYYY";

  // --- Color and State Management ---
  const GROUP_COLORS = {
    'A': 'hsl(205, 70%, 50%)', // Blue
    'B': 'hsl(160, 70%, 45%)', // Teal/Green
    'C': 'hsl(350, 75%, 55%)', // Red
    'D': 'hsl(35, 85%, 50%)',  // Orange
    'F': 'hsl(280, 60%, 60%)', // Purple
    'G': 'hsl(50, 80%, 50%)',  // Yellow/Gold
    'DEFAULT': 'hsl(0, 0%, 50%)' // Grey for ungrouped
  };
  // --- FIX: Define the average color in the same format the browser will compute it ---
  const AVERAGE_COLOR = 'rgb(0, 0, 0)';

  let chartData = []; // Stores the processed data in original CSV order with static colors

  document.addEventListener('DOMContentLoaded', function() {
    const csvFileInput = document.getElementById('csv-file');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', handleFileSelect);
    }

    const groupCheckbox = document.getElementById('group-machines-checkbox');
    if (groupCheckbox) {
      groupCheckbox.addEventListener('change', () => {
        // When the checkbox changes, re-draw the chart with the new sorting preference.
        drawGraph(chartData, groupCheckbox.checked);
      });
    }
  });

  function handleFileSelect(evt) {
    const file = evt.target.files[0];
    if (file) {
      parseCSV(file);
    }
  }

  /**
   * Parses a string value into a number, handling European number formats and units.
   * It can process numbers with comma decimals ("123,45") and removes units like "lb" or "s".
   * @param {*} val The value to convert.
   * @returns {number|null} The parsed number, or null if conversion is not possible.
   */
  function toNumberOrNull(val) {
    if (val == null) return null;
    if (typeof val === 'number' && isFinite(val)) return val;

    // Remove units like "lb", "s" and other non-numeric characters except comma/dot.
    let s = String(val).replace(/[^0-9.,]/g, '').trim();
    if (s === '') return null;

    // Standardize the number string by replacing a decimal comma with a dot.
    s = s.replace(',', '.');

    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function parseCSV(csvFile) {
    // We will parse the whole file as an array of arrays and process headers manually.
    // This gives us full control over headers, especially the empty ones.
    const config = {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
      delimiter: ";",
      complete: function(results) {
        if (results.errors.length > 0) {
          console.error("Errors parsing CSV:", results.errors);
          alert("There was an error parsing the CSV file. Please check the console for details.");
          return;
        }
        transform(results.data);
      }
    };
    Papa.parse(csvFile, config);
  }

  function transform(data) {
    if (!data || data.length < 2) { // We need at least a header row and one data row.
      alert("CSV file is empty or has no data.");
      return;
    }

    const headers = data[0];
    const rows = data.slice(1);

    const machineColumns = [];

    // Identify the primary machine columns.
    // This logic now correctly handles both CSV formats.
    for (let i = 1; i < headers.length; i++) {
      const header = headers[i].trim();
      if (header) {
        // This is a primary machine column (e.g., "A3", "A3 lbs").
        machineColumns.push({ name: header, index: i });

        // If the next column has an empty header, it's a 'sec' column, so we skip it.
        if (i + 1 < headers.length && !headers[i + 1].trim()) {
          i++; // Increment i to skip the empty-headed 'sec' column.
        }
        // If the next column is explicitly named '... sec', the main loop will handle it.
      }
    }

    // Transform the row-based CSV data into a series of lines for the chart.
    let lines = machineColumns.map(machine => {
      // For each machine, find its corresponding 'sec' column.
      const machineBaseName = machine.name.replace(/ lbs$/i, '').trim();

      // The 'sec' column is assumed to be immediately after the machine's primary column.
      const secIndex = machine.index + 1;

      const values = rows.map(row => {
        const dateString = row[0]; // Date is always in the first column.
        const y = toNumberOrNull(row[machine.index]); // Weight value.

        // Only create a data point if both date and a valid weight exist.
        if (dateString && typeof y === 'number') {
          const point = { x: dateString, y: y };

          // If a corresponding 'sec' column exists, add its value.
          if (secIndex < headers.length) {
            point.sec = toNumberOrNull(row[secIndex]);
          } else {
            point.sec = null; // No 'sec' column exists for this data point.
          }
          return point;
        }
        return null;
      }).filter(point => point !== null);

      return { key: machineBaseName, values: values };
    }).filter(line => line.values.length > 0);

    // --- START: Assign Static Colors ONCE (without changing 'lines' order) ---
    // To ensure consistent color derivation, we need a stable order for calculating shades.
    // We'll create a temporary sorted list of keys for this purpose.
    const sortedMachineKeys = lines
        .map(line => line.key)
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

    const groupCountsForColoring = new Map();
    const machineColorsMap = new Map(); // Stores the derived color for each machine key

    // Derive colors based on the stable sorted order of keys
    sortedMachineKeys.forEach(key => {
      machineColorsMap.set(key, getColorForMachine(key, groupCountsForColoring));
    });

    // Now, assign the derived colors to the 'lines' array (which is still in original CSV order)
    lines.forEach(line => {
      line.color = machineColorsMap.get(line.key);
    });
    // --- END: Assign Static Colors ONCE ---

    const dailyTotals = new Map();
    lines.forEach(line => {
      line.values.forEach(point => {
        const { x: date, y: weight } = point;
        if (!dailyTotals.has(date)) {
          dailyTotals.set(date, { totalWeight: 0, count: 0 });
        }
        const current = dailyTotals.get(date);
        current.totalWeight += weight;
        current.count++;
      });
    });

    const averageValues = [];
    dailyTotals.forEach((value, date) => {
      averageValues.push({
        x: date,
        y: value.totalWeight / value.count
      });
    });

    // Sort the average values by date to ensure the line is drawn correctly
    averageValues.sort((a, b) => moment(a.x, dateFormat).toDate() - moment(b.x, dateFormat).toDate());

    let averageLine;
    if (averageValues.length > 0) {
      averageLine = {
        key: 'Average',
        values: averageValues,
        isAverage: true,
        color: AVERAGE_COLOR
      };
    }

    // Store the fully processed data. 'lines' is in original CSV column order.
    // We'll add the average line to chartData here, always at the beginning.
    chartData = [];
    if (averageLine) {
      chartData.push(averageLine);
    }
    chartData = chartData.concat(lines); // Add all machine lines after the average line

    const isGrouped = document.getElementById('group-machines-checkbox')?.checked || false;
    drawGraph(chartData, isGrouped);
  }

  /**
   * Generates a color for a machine based on its group.
   * @param {string} key The machine key (e.g., "A3").
   * @param {Map<string, number>} groupCounts A map to track how many machines are in each group.
   * @returns {string} An HSL color string.
   */
  function getColorForMachine(key, groupCounts) {
    const group = key.charAt(0).toUpperCase();
    const baseColor = GROUP_COLORS[group] || GROUP_COLORS['DEFAULT'];
    const countInGroup = groupCounts.get(group) || 0;
    groupCounts.set(group, countInGroup + 1); // Increment count for this group

    // Parse the HSL color string (e.g., "hsl(205, 70%, 50%)")
    const [hue, saturation, lightness] = baseColor.match(/\d+/g).map(Number);

    // Don't modify the first color in a group
    if (countInGroup === 0) {
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    // For subsequent machines in the same group, slightly change lightness
    // This creates visually related, but distinct, colors.
    // Alternating positive/negative shift for better distribution
    const lightnessShift = (countInGroup % 2 === 1 ? 1 : -1) * Math.ceil(countInGroup / 2) * 8;
    const newLightness = Math.max(20, Math.min(85, lightness + lightnessShift)); // Clamp between 20% and 85%

    return `hsl(${hue}, ${saturation}%, ${newLightness}%)`;
  }

  function drawGraph(sourceData, isGrouped) {
    // Create a deep copy to avoid modifying the original chartData
    let valueLines = JSON.parse(JSON.stringify(sourceData));

    // Separate average line from machine lines
    const averageLine = valueLines.find(d => d.isAverage);
    let machineLines = valueLines.filter(d => !d.isAverage);

    if (isGrouped) {
      // If grouping is checked, sort machine lines alphabetically
      machineLines.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
    }
    // If not grouped, machineLines already retains the order from sourceData (original CSV order).

    // Re-assemble the final array for the chart, always with average first if it exists
    valueLines = [];
    if (averageLine) {
      valueLines.push(averageLine);
    }
    valueLines = valueLines.concat(machineLines);


    d3.select('#chart svg').selectAll('*').remove();

    nv.addGraph(function() {
      const chart = nv.models.lineChart()
          .margin({ left: 50, right: 50, top: 50 })
          .useInteractiveGuideline(true)
          .x(d => moment(d.x, dateFormat, true).toDate());

      // --- SIMPLIFIED & ROBUST COLOR LOGIC ---
      // Simply read the static color that was assigned during the transform step.
      chart.color(d => d.color);

      // Tooltip, Axis, and other configurations remain largely the same...
      chart.interactiveLayer.tooltip.contentGenerator(function(d) {
        if (d === null) return '';
        const date = d3.time.format('%d.%m.%Y')(new Date(d.value));
        let table = `<table><thead><tr><th colspan="4">${date}</th></tr><tr><th colspan="2">Machine</th><th class="value">LBS</th><th class="value">SEC.</th></tr></thead><tbody>`;
        d.series.forEach(function(elem) {
          if (elem.data.isAverage) {
            table += `<tr><td class="legend-color-guide"><div style="background-color: ${elem.color};"></div></td><td class="key">${elem.key}</td><td class="value">${d3.format(',.1f')(elem.value)}</td><td class="value"></td></tr>`;
          } else {
            const secNumericValue = elem.data.sec;
            const secDisplayValue = (secNumericValue !== null && typeof secNumericValue === 'number') ? secNumericValue : 'N/A';
            let secCellClass = '';
            if (secNumericValue !== null && typeof secNumericValue === 'number') {
              if (secNumericValue < 120) secCellClass = 'sec-bad';
              else if (secNumericValue < 150) secCellClass = 'sec-ok';
              else secCellClass = 'sec-good';
            }
            table += `<tr><td class="legend-color-guide"><div style="background-color: ${elem.color};"></div></td><td class="key">${elem.key}</td><td class="value">${d3.format(',.0f')(elem.value)}</td><td class="value ${secCellClass}">${secDisplayValue}</td></tr>`;
          }
        });
        table += '</tbody></table>';
        return table;
      });

      chart.xScale(d3.time.scale());
      chart.xAxis.axisLabel('Time').tickFormat(d => d3.time.format('%d.%m.%y')(new Date(d)));
      chart.yAxis.axisLabel('Lbs').tickFormat(d3.format(',.0f'));

      d3.select('#chart svg').datum(valueLines).transition().duration(500).call(chart);

      // --- START: Simplified Legend Styling Logic ---
      // This runs every time the chart is rendered or updated.
      chart.dispatch.on('renderEnd', function() {

        // --- 1. Style the Legend Item ---
        // First, clean up any previous state from all legend items.
        d3.selectAll('#chart .nv-legend .nv-series')
            .classed('average-legend-item', false);

        // Then, add a specific class to the Average legend item using its reliable data flag.
        d3.selectAll('#chart .nv-legend .nv-series')
            .filter(d => d.isAverage)
            .classed('average-legend-item', true);

        // --- 2. Style the Legend Symbols ---
        // Make the Average legend symbol larger.
        d3.selectAll('#chart .nv-legend .average-legend-item .nv-legend-symbol')
            .attr('r', 7);

        // The line that removed the stroke has been deleted from here.
      });
      // --- END: Simplified Legend Styling Logic ---

      nv.utils.windowResize(chart.update);
      return chart;
    });
  }
})();
