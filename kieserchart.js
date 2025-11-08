(function() {
  'use strict';

  const dateFormat = "DD.MM.YYYY";

  // --- START: New Color and State Management ---

  // 1. Define base colors for each machine group.
  // These can be easily customized.
  const GROUP_COLORS = {
    'A': 'hsl(205, 70%, 50%)', // Blue
    'B': 'hsl(160, 70%, 45%)', // Teal/Green
    'C': 'hsl(350, 75%, 55%)', // Red
    'D': 'hsl(35, 85%, 50%)',  // Orange
    'F': 'hsl(280, 60%, 60%)', // Purple
    'G': 'hsl(50, 80%, 50%)',  // Yellow/Gold
    'DEFAULT': 'hsl(0, 0%, 50%)' // Grey for ungrouped
  };
  const AVERAGE_COLOR = 'hsl(0, 0%, 10%)'; // Almost black for the Average line

  // 2. Store chart data globally to allow re-sorting without re-parsing.
  let chartData = [];
  // --- END: New Color and State Management ---


  document.addEventListener('DOMContentLoaded', function() {
    const csvFileInput = document.getElementById('csv-file');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', handleFileSelect);
    }

    // --- START: Checkbox Event Listener ---
    const groupCheckbox = document.getElementById('group-machines-checkbox');
    if (groupCheckbox) {
      groupCheckbox.addEventListener('change', () => {
        // When the checkbox changes, re-draw the chart with the new sorting preference.
        drawGraph(chartData, groupCheckbox.checked);
      });
    }
    // --- END: Checkbox Event Listener ---
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
      }).filter(point => point !== null); // Remove any empty points.

      return {
        key: machineBaseName, // Use the clean base name for the legend.
        values: values
      };
    }).filter(line => line.values.length > 0); // Only keep lines that have data.

    // Calculate the average line
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

    if (averageValues.length > 0) {
      const averageLine = {
        key: 'Average',
        values: averageValues,
        isAverage: true,
        color: AVERAGE_COLOR
      };
      // Add the average line to the beginning of the array
      lines.unshift(averageLine);
    }

    // Store the fully processed data and draw the chart for the first time.
    chartData = lines;
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
    groupCounts.set(group, countInGroup + 1);

    // Parse the HSL color string (e.g., "hsl(205, 70%, 50%)")
    const [hue, saturation, lightness] = baseColor.match(/\d+/g).map(Number);

    // Don't modify the first color in a group
    if (countInGroup === 0) {
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    // For subsequent machines in the same group, slightly change lightness and saturation
    // This creates visually related, but distinct, colors.
    const lightnessShift = (countInGroup % 2 === 1 ? 1 : -1) * Math.ceil(countInGroup / 2) * 8;
    const newLightness = Math.max(20, Math.min(85, lightness + lightnessShift)); // Clamp between 20% and 85%

    return `hsl(${hue}, ${saturation}%, ${newLightness}%)`;
  }


  function drawGraph(sourceData, isGrouped) {
    // Create a deep copy to avoid modifying the original data.
    let valueLines = JSON.parse(JSON.stringify(sourceData));

    // --- START: New Sorting Logic ---
    const averageLine = valueLines.find(d => d.isAverage);
    let machineLines = valueLines.filter(d => !d.isAverage);

    if (isGrouped) {
      // Sort by machine name (A1, A3, B1, B7...)
      machineLines.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
    }
    // If not grouped, we just use the original parsed order.

    valueLines = [averageLine, ...machineLines].filter(Boolean); // Re-assemble the array
    // --- END: New Sorting Logic ---

    d3.select('#chart svg').selectAll('*').remove();

    nv.addGraph(function() {
      const chart = nv.models.lineChart()
          .margin({ left: 50, right: 50, top: 50 })
          .useInteractiveGuideline(true)
          .x(d => moment(d.x, dateFormat, true).toDate());

      // --- START: New Color Logic ---
      const groupCounts = new Map(); // Track machine counts per group for color derivation
      chart.color(d => {
        if (d.isAverage) return d.color;
        return getColorForMachine(d.key, groupCounts);
      });
      // --- END: New Color Logic ---

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

      // --- START: The Guaranteed Styling Logic ---
      // This runs every time the chart is rendered or updated.
      chart.dispatch.on('renderEnd', function() {
        let averageSeriesIndex = -1;

        // Find the current index of the "Average" series in the legend.
        d3.selectAll('#chart .nv-legend .nv-series')
            .each(function(d, i) {
              if (d.isAverage) {
                averageSeriesIndex = i;
              }
            });

        // Clean up previous state.
        d3.selectAll('#chart .nv-linesWrap .nv-series')
            .classed('average-line-series', false);

        // If the average series is visible, apply the class to the correct line.
        if (averageSeriesIndex !== -1) {
          d3.select('#chart .nv-linesWrap .nv-series-' + averageSeriesIndex)
              .classed('average-line-series', true);
        }

        // Style the 'Average' legend symbol to be larger.
        d3.selectAll('#chart .nv-legend-symbol')
            .filter((d) => d.isAverage)
            .attr('r', 10);

        // --- NEW ---
        // Remove the stroke from ALL legend symbols for a cleaner look.
        d3.selectAll('#chart .nv-legend-symbol')
            .style('stroke-width', 0);
      });
      // --- END: The Guaranteed Styling Logic ---

      nv.utils.windowResize(chart.update);
      return chart;
    });
  }
})();
