// Hero Damage main script
(function (hd) {
  // Avoid initializing it twice
  if (hd.hasInitialized) return;

  // Format number the US way, only used here
  function formatNumber(number) {
    return new Intl.NumberFormat("en-US").format(number);
  }

  // Copy the content to the clipboard
  hd.copyToClipboard = function copyToClipboard(elementId) {
    var copyText = document.getElementById(elementId);
    copyText.select();
    document.execCommand("Copy");
  };

  // Combinations
  // Wrap is due to variable having function scope (could implement OOP at some point)
  (function () {
    var combinationsData;
    var hasBossDPS = false;

    hd.combinationsUpdate = function combinationsUpdate() {
      if (!combinationsData)
        return;
      var filterTalents = document.getElementById("combinations-table-filter-talents").value;
      var filterTalentsRegex = new RegExp("^" + filterTalents.replace(new RegExp("x|\\*", "ig"), "[0-3]"), "i");
      var filterSets = $("#combinations-table-filter-sets").val();
      var filterLegendaries = $("#combinations-table-filter-legendaries").val();
      var combinationsRows = $.grep(combinationsData, function (columns) {
        if (filterTalents !== "" && !filterTalentsRegex.test(columns[0]))
          return false;
        if (filterSets.indexOf(columns[1]) < 0)
          return false;
        var legos = columns[2].split(", ");
        if ($(filterLegendaries).filter(legos).length < legos.length && columns[2] !== "None")
          return false;
        return true;
      });
      var tableData = document.getElementById("combinations-table-data");
      var $tableNav = $(document.getElementById("combinations-table-nav"));
      if ($tableNav.data("twbs-pagination"))
        $tableNav.twbsPagination("destroy");
      $tableNav.twbsPagination({
        totalPages: Math.max(1, Math.ceil(combinationsRows.length / 15)),
        visiblePages: 3,
        onPageClick: function (event, page) {
          var html = "";
          combinationsRows.slice((page - 1) * 15, page * 15).forEach(function (columns) {
            html += "<tr>";
            html += "<td>" + columns[columns.length - 1] + "</td>";
            html += "<td>" + columns[0] + "</td>";
            html += "<td>" + columns[1] + "</td>";
            html += "<td>" + columns[2] + "</td>";
            html += "<td>" + formatNumber(columns[3]) + "</td>";
            if (hasBossDPS) {
              html += "<td>";
              if (columns.length === 6)
                html += formatNumber(columns[4]);
              html += "</td>";
            }
            html += "</tr>";
          });
          tableData.innerHTML = html;
        }
      });
    };

    hd.combinationsInit = function combinationsInit(reportPath) {
      $.get("/" + reportPath, function (data) {
        combinationsData = $.csv.toArrays(data);
        combinationsData.sort(function (a, b) {
          return b[3] - a[3];
        });
        var idx = 0;
        var sets = [];
        var legos = [];
        combinationsData.forEach(function (columns) {
          idx++;
          columns.push(idx);
          if ($.inArray(columns[1], sets) < 0) {
            sets.push(columns[1]);
          }
          columns[2].split(", ").forEach(function (lego) {
            if (lego !== "None" && $.inArray(lego, legos) < 0) {
              legos.push(lego);
            }
          });
          if (!hasBossDPS && columns.length === 6)
            hasBossDPS = true;
        });
        sets.sort().reverse();
        sets.forEach(function (set) {
          document.getElementById("combinations-table-filter-sets").insertAdjacentHTML("beforeend", "<option>" + set + "</option>");
        });
        var setSelect = $("#combinations-table-filter-sets");
        setSelect.selectpicker("val", sets);
        setSelect.selectpicker("refresh");
        legos.sort();
        legos.forEach(function (lego) {
          document.getElementById("combinations-table-filter-legendaries").insertAdjacentHTML("beforeend", "<option>" + lego + "</option>");
        });
        var legoSelect = $("#combinations-table-filter-legendaries");
        var beltIdx = legos.indexOf("Cinidaria"); // Don't show Cinidaria by default
        if (beltIdx > -1) {
          legos.splice(beltIdx, 1);
        }
        legoSelect.selectpicker("val", legos);
        legoSelect.selectpicker("refresh");
        if (hasBossDPS) {
          document.getElementById("combinations-table-headers").insertAdjacentHTML("beforeend", "<th>Boss DPS</th>");
          document.getElementById("combinations-table-filters").insertAdjacentHTML("beforeend", "<th></th>");
        }
        hd.combinationsUpdate();
        $(document.getElementById("combinations-loading")).remove();
      });
    };
  })();

  // Relics
  hd.relicsInit = function relicsInit(reportPath, chartTitle, iLevelValues) {
    google.charts.load("current", {"packages": ["corechart"]});
    google.charts.setOnLoadCallback(drawChart);

    function excludeEmptyRows(dataTable) {
      var view = new google.visualization.DataView(dataTable);
      var rowIndexes = view.getFilteredRows([{column: 1, value: null}]);
      view.hideRows(rowIndexes);
      return view.toDataTable();
    }

    function drawChart() {
      var columntypes = ["string"];
      for (var i = 0; i < iLevelValues; i++) {
        columntypes.push("number"); // Value
        columntypes.push("string"); // Annotation
      }
      var query = new google.visualization.Query("/" + reportPath, {
        csvColumns: columntypes,
        csvHasHeader: false
      });
      query.send(handleQueryResponse);
    }

    function handleQueryResponse(response) {
      if (response.isError()) {
        alert("Error in query: " + response.getMessage() + " " + response.getDetailedMessage());
        return;
      }
      var col, row;

      var data = response.getDataTable();

      // Sort by last column (relic ilevel), then 3 relics (column 5)
      data.sort([{column: data.getNumberOfColumns() - 1, desc: true}, {column: 5, desc: true}]);

      // Mark annotation columns
      for (col = 2; col < data.getNumberOfColumns(); col += 2) {
        data.setColumnProperties(col, {type: "string", role: "annotation"});
      }

      // Add Tooltip and Style columns
      for (col = 3; col <= data.getNumberOfColumns(); col += 4) {
        data.insertColumn(col, {type: "string", role: "tooltip", "p": {"html": true}});
        data.insertColumn(col + 1, {type: "string", role: "style"});
      }

      // Define Crucible T2
      var CrucibleLightTraits = ["LightSpeed", "InfusionOfLight", "SecureInTheLight", "Shocklight"];
      var CrucibleShadowTraits = ["MasterOfShadows", "MurderousIntent", "Shadowbind", "TormentTheWeak", "ChaoticDarkness", "DarkSorrows"];

      // Calculate Differences
      for (row = 0; row < data.getNumberOfRows(); row++) {
        var relicStyle = "";
        if ($.inArray(data.getValue(row, 0), CrucibleLightTraits) >= 0) {
          relicStyle = "stroke-width: 4; stroke-color: #bb8800; color: #ffcc00";
        } else if ($.inArray(data.getValue(row, 0), CrucibleShadowTraits) >= 0) {
          relicStyle = "stroke-width: 4; stroke-color: #5500aa; color: #8800ff";
        }
        var prevVal = 0;
        for (col = 1; col < data.getNumberOfColumns(); col += 4) {
          var curVal = data.getValue(row, col);
          var stepVal = curVal - prevVal;
          var tooltip = "<div class=\"chart-tooltip\"><b>" + data.getValue(row, col + 1) + "x " + data.getValue(row, 0) +
            "</b><br><b>Total:</b> " + formatNumber(curVal.toFixed()) +
            "<br><b>Increase:</b> " + formatNumber(stepVal.toFixed()) + "</div>";
          data.setValue(row, col + 2, tooltip);
          data.setValue(row, col + 3, relicStyle);
          data.setValue(row, col, stepVal);
          if (stepVal < 0) {
            data.setValue(row, col, 0);
            data.setValue(row, col + 1, "");
          }
          prevVal = curVal > prevVal ? curVal : prevVal;
        }
      }

      // Sort crucible traits to the bottom using a temporary column
      var sortCol = data.addColumn("number");
      for (row = 0; row < data.getNumberOfRows(); row++) {
        if ($.inArray(data.getValue(row, 0), CrucibleLightTraits) >= 0 || $.inArray(data.getValue(row, 0), CrucibleShadowTraits) >= 0) {
          data.setValue(row, sortCol, 1);
        } else {
          data.setValue(row, sortCol, 0);
        }
      }
      data.sort([{column: sortCol, desc: false}]);
      data.removeColumn(sortCol);

      // Get content width (to force a min-width on mobile, can't do it in css because of the overflow)
      var content = document.getElementById("fightstyle-tabs");
      var contentWidth = content.innerWidth - window.getComputedStyle(content, null).getPropertyValue("padding-left") * 2;

      // Set chart options
      var chartWidth = document.documentElement.clientWidth >= 768 ? contentWidth : 700;
      var bgcol = "#222";
      var textcol = "#CCC";
      var options = {
        title: chartTitle,
        backgroundColor: bgcol,
        chartArea: {
          top: 50,
          bottom: 100,
          left: 150,
          right: 50
        },
        hAxis: {
          gridlines: {
            count: 20
          },
          format: 'short',
          textStyle: {
            color: textcol
          },
          title: "DPS Increase",
          titleTextStyle: {
            color: textcol
          },
          viewWindow: {
            min: 0
          }
        },
        vAxis: {
          textStyle: {
            fontSize: 12,
            color: textcol
          },
          titleTextStyle: {
            color: textcol
          }
        },
        annotations: {
          textStyle: {
            fontSize: 10
          },
          alwaysOutside: true,
          stem: {
            length: -10,
            color: "transparent"
          }
        },
        titleTextStyle: {
          color: textcol
        },
        tooltip: {
          isHtml: true
        },
        legend: {
          position: "none"
        },
        isStacked: true,
        width: chartWidth
      };

      // Instantiate and draw our chart, passing in some options.
      var chart = new google.visualization.BarChart(document.getElementById("google-chart"));
      chart.draw(excludeEmptyRows(data), options);
    }
  };

  // Trinkets
  hd.trinketsInit = function trinketsInit(reportPath, chartTitle) {
    function excludeEmptyRows(dataTable) {
      var view = new google.visualization.DataView(dataTable);
      var rowIndexes = view.getFilteredRows([{column: 1, value: null}]);
      view.hideRows(rowIndexes);
      return view.toDataTable();
    }

    function drawChart() {
      $.get("/" + reportPath, function (csvString) {
        var arrayData = $.csv.toArrays(csvString, {
          onParseValue: function (value, state) {
            if (state.rowNum <= 1) {
              return value.toString();
            }
            return $.csv.hooks.castToScalar(value, state);
          }
        });
        var data = new google.visualization.arrayToDataTable(arrayData);
        var col, row;

        // Sorting
        var sortCol = data.addColumn("number");
        for (row = 0; row < data.getNumberOfRows(); row++) {
          var biggestTotalValue = 0;
          for (col = 1; col < sortCol; col++) {
            if (data.getValue(row, col) > biggestTotalValue)
              biggestTotalValue = data.getValue(row, col);
          }
          data.setValue(row, sortCol, biggestTotalValue);
        }
        data.sort([{column: sortCol, desc: true}]);
        data.removeColumn(sortCol);

        // Add Tooltip columns
        for (col = 2; col <= data.getNumberOfColumns(); col += 2) {
          data.insertColumn(col, {type: "string", role: "tooltip", "p": {"html": true}});
        }

        // Calculate Differences
        for (row = 0; row < data.getNumberOfRows(); row++) {
          var prevVal = 0;
          for (col = 1; col < data.getNumberOfColumns(); col += 2) {
            var curVal = data.getValue(row, col);
            var stepVal = curVal - prevVal;
            var tooltip = "<div class=\"chart-tooltip\"><b>" + data.getValue(row, 0) +
              "<br> Item Level " + data.getColumnLabel(col) + "</b>" +
              "<br><b>Total:</b> " + formatNumber(curVal.toFixed()) +
              "<br><b>Increase:</b> " + formatNumber(stepVal.toFixed()) + "</div>";
            data.setValue(row, col + 1, tooltip);
            data.setValue(row, col, stepVal);
            prevVal = curVal > prevVal ? curVal : prevVal;
          }
        }

        // Get content width (to force a min-width on mobile, can't do it in css because of the overflow)
        var content = document.getElementById("fightstyle-tabs");
        var contentWidth = content.innerWidth - window.getComputedStyle(content, null).getPropertyValue("padding-left") * 2;

        // Set chart options
        var chartWidth = document.documentElement.clientWidth >= 768 ? contentWidth : 700;
        var bgcol = "#222";
        var textcol = "#CCC";
        var options = {
          title: chartTitle,
          backgroundColor: bgcol,
          chartArea: {
            top: 50,
            bottom: 100,
            right: 150,
            left: 200
          },
          hAxis: {
            gridlines: {
              count: 20
            },
            format: "short",
            textStyle: {
              color: textcol
            },
            title: "DPS Increase",
            titleTextStyle: {
              color: textcol
            },
            viewWindow: {
              min: 0
            }
          },
          vAxis: {
            textStyle: {
              fontSize: 12,
              color: textcol
            },
            titleTextStyle: {
              color: textcol
            }
          },
          legend: {
            textStyle: {
              color: textcol
            }
          },
          titleTextStyle: {
            color: textcol
          },
          tooltip: {
            isHtml: true
          },
          isStacked: true,
          width: chartWidth
        };

        // Instantiate and draw our chart, passing in some options.
        var chart = new google.visualization.BarChart(document.getElementById("google-chart"));
        chart.draw(excludeEmptyRows(data), options);
      });
    }

    google.charts.load("current", {"packages": ["corechart"]});
    google.charts.setOnLoadCallback(drawChart);
  };

  // Prevent further initialization
  hd.hasInitialized = true;

  window.herodamage = hd;

}(window.herodamage || {}));