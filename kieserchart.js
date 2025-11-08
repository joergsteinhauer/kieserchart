(function() {
  'use strict';

  const dateFormat = "DD.MM.YYYY";

  document.addEventListener('DOMContentLoaded', function() {
    const csvFileInput = document.getElementById('csv-file');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', handleFileSelect);
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
    const lines = machineColumns.map(machine => {
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
        isAverage: true, // Keep this for the tooltip and legend symbol
        // This function is automatically called by NVD3 to add a custom class.
        classes: function() {
          return 'average-line-series';
        }
      };
      // Add the average line to the beginning of the array
      lines.unshift(averageLine);
    }

    drawGraph(lines);
  }

  function drawGraph(valueLines) {
    // Clear previous chart before drawing a new one.
    d3.select('#chart svg').selectAll('*').remove();

    nv.addGraph(function() {
      const chart = nv.models.lineChart()
          .margin({ left: 50, right: 50, top: 50 })
          .useInteractiveGuideline(true)
          .x(function(valueObj) {
            // Use Moment.js for strict date parsing based on our specific format.
            moment.locale('de');
            const m = moment(valueObj.x, dateFormat, true);
            return m.isValid() ? m.toDate() : null;
          });

      // Tooltip Customization
      // Use a content generator to create custom HTML for the tooltip.
      chart.interactiveLayer.tooltip.contentGenerator(function(d) {
        if (d === null) {
          return '';
        }
        // Format the date for the tooltip header.
        const date = d3.time.format('%d.%m.%Y')(new Date(d.value));
        let table = `<table>
                       <thead>
                         <tr><th colspan="4">${date}</th></tr>
                         <tr>
                           <th colspan="2">Machine</th>
                           <th class="value">LBS</th>
                           <th class="value">SEC.</th>
                         </tr>
                       </thead>
                       <tbody>`;

        // Add a row for each data series (each machine).
        d.series.forEach(function(elem) {
          // Handle the special "Average" line in the tooltip
          if (elem.data.isAverage) {
            table += `<tr>
                        <td class="legend-color-guide"><div style="background-color: ${elem.color};"></div></td>
                        <td class="key">${elem.key}</td>
                        <td class="value">${d3.format(',.1f')(elem.value)}</td>
                        <td class="value"></td>
                      </tr>`;
          } else {
            // Handle regular machine lines
            const secNumericValue = elem.data.sec;
            const secDisplayValue = (secNumericValue !== null && typeof secNumericValue === 'number')
                ? secNumericValue
                : 'N/A';

            let secCellClass = '';
            if (secNumericValue !== null && typeof secNumericValue === 'number') {
              if (secNumericValue < 120) {
                secCellClass = 'sec-bad';
              } else if (secNumericValue < 150) {
                secCellClass = 'sec-ok';
              } else {
                secCellClass = 'sec-good';
              }
            }

            table += `<tr>
                        <td class="legend-color-guide"><div style="background-color: ${elem.color};"></div></td>
                        <td class="key">${elem.key}</td>
                        <td class="value">${d3.format(',.0f')(elem.value)}</td>
                        <td class="value ${secCellClass}">${secDisplayValue}</td>
                      </tr>`;
          }
        });

        table += '</tbody></table>';
        return table;
      });

      // Chart axes
      chart.xScale(d3.time.scale());
      chart.xAxis
          .axisLabel('Time')
          .tickFormat(function(dateNumber) {
            // Format the date for the x-axis ticks.
            const date = new Date(dateNumber);
            return d3.time.format('%d.%m.%y')(date);
          });

      chart.yAxis
          .axisLabel('Lbs')
          .tickFormat(d3.format(',.0f'));

      d3.select('#chart svg')
          .datum(valueLines)
          .transition().duration(500)
          .call(chart);

      // Style the legend symbol
      chart.dispatch.on('renderEnd', function() {
        d3.selectAll('#chart .nv-legend-symbol')
            .filter((d) => d.isAverage)
            .attr('r', 10);
      });

      nv.utils.windowResize(chart.update);
      return chart;
    });
  }

})();
