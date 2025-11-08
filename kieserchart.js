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
   * Parses a string value into a number, handling various European number formats.
   * It can process numbers with comma decimals ("123,45") and thousands separators
   * like dots or spaces ("1.234,56").
   * @param {*} val The value to convert.
   * @returns {number|null} The parsed number, or null if conversion is not possible.
   */
  function toNumberOrNull(val) {
    if (val == null) return null;
    if (typeof val === 'number' && isFinite(val)) return val;

    let s = String(val).trim();
    if (s === '') return null;

    // Standardize the number string by removing thousands separators and replacing a decimal comma with a dot.
    s = s.replace(/\s/g, ''); // Remove spaces
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      // Handles "1.234,56" -> "1234.56"
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Handles "123,45" -> "123.45"
      s = s.replace(',', '.');
    }

    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function parseCSV(csvFile) {
    const config = {
      header: true,
      // We do our own number parsing to handle locale-specific formats (e.g., comma as decimal).
      dynamicTyping: false,
      skipEmptyLines: true,
      delimiter: ";",
      complete: function(results) {
        if (results.errors.length > 0) {
          console.error("Errors parsing CSV:", results.errors);
          alert("There was an error parsing the CSV file. Please check the console for details.");
          return;
        }
        transform(results);
      }
    };
    Papa.parse(csvFile, config);
  }

  function transform(parsed) {
    if (!parsed.data || parsed.data.length === 0) {
      alert("CSV file is empty or invalid.");
      return;
    }

    const firstRow = parsed.data[0];
    const dateColumnName = parsed.meta.fields[0];

    // From the headers, create a list of machine names to plot, ignoring the date column and any columns related to time (sec).
    const columnHeaders = Object.keys(firstRow)
        .slice(1) // Ignore the first column (date)
        .filter(key => key.toLowerCase().indexOf('sec') === -1 && key.trim() !== '');

    const rows = parsed.data;

    // Transform the row-based CSV data into a series of lines for the chart.
    const lines = columnHeaders.map(function(columnName) {
      const values = rows.map(function(row) {
        const dateString = row[dateColumnName];
        const y = toNumberOrNull(row[columnName]);

        // Only create a data point if both date and a valid weight exist.
        if (dateString && typeof y === 'number') {
          return { x: dateString, y: y };
        }
        return null;
      })
          .filter(point => point !== null); // Remove any empty points

      return { key: columnName, values: values };
    }).filter(line => line.values.length > 0); // Only keep lines that have data

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

      nv.utils.windowResize(chart.update);
      return chart;
    });
  }

})();
