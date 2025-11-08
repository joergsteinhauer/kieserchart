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
    // We change the strategy here. We will not use the `header: true` option.
    // Instead, we'll parse the whole file as an array of arrays and process headers manually.
    // This gives us full control over headers, especially the empty ones.
    const config = {
      header: false, // This is the most important change!
      dynamicTyping: false,
      skipEmptyLines: true,
      delimiter: ";",
      complete: function(results) {
        if (results.errors.length > 0) {
          console.error("Errors parsing CSV:", results.errors);
          alert("There was an error parsing the CSV file. Please check the console for details.");
          return;
        }
        // Manually transform the data now that we have full control.
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

    // The first row is our headers, the rest is the data.
    const headers = data[0];
    const rows = data.slice(1);
    const dateColumnName = headers[0];

    // From the headers, create a list of machine names.
    // We find the index of each machine name column.
    const machineColumns = [];
    headers.forEach((header, index) => {
      // A machine column is one that has a non-empty header and is not the 'Datum' column.
      if (header && header.trim() !== '' && index > 0) {
        machineColumns.push({ name: header, index: index });
      }
    });

    // Transform the row-based CSV data into a series of lines for the chart.
    const lines = machineColumns.map(function(machine) {
      const values = rows.map(function(row) {
        const dateString = row[0]; // Date is always in the first column.
        // The value is in the column identified by the machine's index.
        const y = toNumberOrNull(row[machine.index]);

        // Only create a data point if both date and a valid weight exist.
        if (dateString && typeof y === 'number') {
          return { x: dateString, y: y };
        }
        return null;
      })
          .filter(point => point !== null); // Remove any empty points

      return { key: machine.name, values: values };
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
