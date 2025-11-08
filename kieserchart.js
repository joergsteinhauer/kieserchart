var kieserchart = (function() {
  'use strict';

  var dateFormat = "DD.MM.YYYY";

  $(document).ready(function(){
    $("#csv-file").change(handleFileSelect);
  });

  function handleFileSelect(evt) {
    var file = evt.target.files[0];
    parseCSV(file);
  }

  // --- helper: normalize locale numbers (e.g., "1.234,56" or "12,5") ---
  function toNumberOrNull(val) {
    if (val == null) return null;
    if (typeof val === 'number' && isFinite(val)) return val;

    var s = String(val).trim();
    if (s === '') return null;

    // remove common thousands separators
    s = s.replace(/\s+/g, '');   // spaces
    s = s.replace(/'/g, '');     // apostrophes (e.g., 1'234)
    // if both comma and dot exist, treat dot as thousands; comma as decimal
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf(',') > -1) {
      // only comma present -> decimal comma
      s = s.replace(',', '.');
    }
    // strip anything that isn't part of a standard number
    s = s.replace(/[^0-9+\-eE.]/g, '');

    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function parseCSV(csvFile) {
    var config = {
      header: true,
      dynamicTyping: false,   // we'll do our own number parsing to handle commas
      skipEmptyLines: true,
      complete: function(results) {
        var parsed = results;
        transform(parsed)
      }
    };
    Papa.parse(csvFile, config);
  }

  function transform(parsed) {
    // Collect column headers (exclude *sec* columns)
    var columnHeaders = [];
    var firstRow = parsed.data[0];
    Object.keys(firstRow).forEach(function(key) {
      var invalid = key.toLowerCase().indexOf('sec') > -1;
      if (!invalid) columnHeaders.push(key);
    });

    var rows = parsed.data;

    // For each column, collect values.
    var lines = [];
    columnHeaders.forEach(function(columnName, columnIdx) {
      var values = [];
      rows.forEach(function(row, rowIdx) {
        var x = rowIdx;

        // For the first column (date), keep raw string; for others, normalize numbers
        var raw = row[columnName];
        var y = (columnIdx === 0) ? (raw || null) : toNumberOrNull(raw);

        values.push(new Value(x, y));
      });
      lines.push(new DataLine(columnName, values));
    });

    var dateLine = lines[0];
    var valueLines = lines.slice(1);

    // Substitute x values in valueLines with actual date strings
    valueLines.forEach(function (valueLine) {
      valueLine.values.forEach(function (valueObj) {
        var dateString = dateLine.values[valueObj.x] ? dateLine.values[valueObj.x].y : null;
        valueObj.x = dateString;
      });
      // Optional: drop points that don't have a numeric y or valid date
      valueLine.values = valueLine.values.filter(function(v){
        return v.x && (typeof v.y === 'number' && isFinite(v.y));
      });
    });

    drawGraph(valueLines);
  }

  function Value(x, y) {
    this.x = x;
    this.y = y;
  }

  function DataLine(key, values) {
    this.key = key;
    this.values = values;
  }

  function drawGraph(valueLines) {
    nv.addGraph(function() {
      var chart = nv.models.lineChart()
          .margin({left: 50, right: 50, top: 50})
          .useInteractiveGuideline(true)
          .x(function(valueObj) {
            // strict parse to avoid ambiguous dates
            var m = moment(valueObj.x, dateFormat, true);
            return m.isValid() ? m.toDate() : null;
          });

      chart.xScale(d3.time.scale());
      chart.xAxis
          .axisLabel('Trainings')
          .tickFormat(function(dateNumber) {
            var date = new Date(dateNumber);
            return d3.time.format('%d.%m.%y')(date);
          });

      chart.yAxis
          .axisLabel('Weight or Time')
          .tickFormat(d3.format(',r'));

      d3.select('#chart svg')
          .datum(valueLines)
          .transition().duration(500)
          .call(chart);

      nv.utils.windowResize(chart.update);
      return chart;
    });
  }

})();
