/* Set up API and chart configuration. */
const API_KEY = "<INSERT YOUR API KEY HERE>";

// Each chart in this array will be built out. We need the visualization ID as well
// as the container the chart should be appended to. We also use each chart object
// to save the API visual instance and its options (settings, bindings, ...).
const charts = [
  { id: "18312856", container: "#chart-0", visual: null, options: null }, // data typed visual
  { id: "11846765", container: "#chart-1", visual: null, options: null }, // non data-typed visual
];

/* Helpers */
const format_num = d3.format(",");

function slugify(string) {
  const a =
    "àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;";
  const b =
    "aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------";
  const p = new RegExp(a.split("").join("|"), "g");

  return string
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(p, (c) => b.charAt(a.indexOf(c))) // Replace special characters
    .replace(/&/g, "-and-") // Replace & with 'and'
    .replace(/[^\w\-]+/g, "") // Remove all non-word characters
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
}

function showNote() {
  const note = d3.select("#data-note");
  note.classed("hide", false);
  d3.timeout(() => note.classed("hide", true), 4000);
}

/* Build charts */
// The buildCharts function is triggered initially,
// the updateCharts function is triggered on update.
function updateCharts(data) {
  charts.forEach((chart) => {
    chart.options.data = { data: data };
    chart.visual.update(chart.options);
  });
}

function buildCharts(data, base_charts) {
  base_charts.forEach((base_chart, i) => {
    // Get chart info.
    const chart = charts[i];

    // Augment API props.
    chart.options = base_chart;
    chart.options.api_key = API_KEY;
    chart.options.container = chart.container;
    chart.options.data = { data: data }; // Assuming a single Flourish dataset named `data`.

    // Build visual.
    chart.visual = new Flourish.Live(chart.options);
  });
}

/* Filter function */
// The filter applies as many predicates as there are data column controls.
// The `predicates` array holds one named predicate for each control -
// named so we can alter the column predicate on control change.
let predicates = [];
function filterData(data, column, predicate) {
  // Add specific predicate to predicates.
  predicates.filter((d) => d.column === column)[0].predicate = predicate;

  // Filter data.
  const predicates_pure = predicates.map((d) => d.predicate);
  const result = data.filter((d) =>
    predicates_pure.every((predicate) => predicate(d))
  );

  // Update charts if there's data.
  if (!result.length) {
    showNote();
    return;
  }

  updateCharts(result);
}

/* Build controls */

// Build out a base structure for the controls.
function controlStructure(column) {
  const parent = d3
    .select("#controls")
    .append("div")
    .attr("class", `${slugify(column)} control`);
  parent.append("h3").attr("class", "control-header").html(column);
  return parent.append("div").attr("class", "control-body");
}

// Each of the following `build...` function builds out a specific control type.
function buildMultiSelect(data, column) {
  const values = Array.from(new Set(data.map((dd) => dd[column])));

  const body = controlStructure(column);
  const multi_select = body.append("select").property("multiple", true);

  multi_select
    .selectAll("option")
    .data(values)
    .join("option")
    .property("selected", true)
    .attr("value", (d) => d)
    .html((d) => d);

  multi_select.on("change", function () {
    const selected = Array.from(this.options)
      .filter((option) => option.selected)
      .map((d) => d.value);
    const predicate = (d) => selected.includes(d[column]);
    filterData(data, column, predicate);
  });
}

// Helper functions to prep the dropdown data.
function getQuantiles(data, column) {
  const thresh = [0, 0.33, 0.66, 1];
  const result = [];

  for (let i = 0; i < thresh.length - 1; i++) {
    const curr = thresh[i];
    const next = thresh[i + 1];

    const min = d3.quantile(data, curr, (d) => d[column]);
    const max = d3.quantile(data, next, (d) => d[column]);

    result.push({
      name: `${Math.floor(min)} - ${Math.floor(max)}`,
      predicate: (d) =>
        i !== thresh.length - 2
          ? d[column] >= min && d[column] < max
          : d[column] >= min && d[column] <= max,
    });
  }

  return result;
}

function buildDropdown(data, column) {
  const quants = getQuantiles(data, column);
  quants.unshift({ predicate: (d) => d, name: "All" });

  // Build min max inputs.
  const body = controlStructure(column);
  const dropdown = body.append("select");

  dropdown
    .selectAll("option")
    .data(quants)
    .join("option")
    .attr("value", (d) => d.name)
    .html((d) => d.name);

  dropdown.on("change", function () {
    const selected = Array.from(this.options).filter(
      (option) => option.selected
    )[0];
    const predicate = d3.select(selected).datum().predicate;
    filterData(data, column, predicate);
  });
}

function buildSlider(data, column) {
  // Get min max data.
  const range = d3
    .extent(data.map((d) => d[column]))
    .map((d, i) => (i === 0 ? Math.floor(d) : Math.ceil(d)));

  // Build min inputs.
  const body = controlStructure(column);
  const min_wrap = body.append("div").attr("class", "slider-wrap");
  min_wrap.append("label").attr("for", "min").html("Min");

  const min = min_wrap
    .append("input")
    .attr("id", "min")
    .attr("type", "range")
    .attr("min", range[0])
    .attr("max", range[1])
    .attr("step", 1)
    .property("value", range[0]);

  const min_label = min_wrap
    .append("div")
    .attr("class", "min")
    .html(format_num(range[0]));

  // Build max inputs.
  const max_wrap = body.append("div").attr("class", "slider-wrap");
  max_wrap.append("label").attr("for", "min").html("Max");

  const max = max_wrap
    .append("input")
    .attr("id", "max")
    .attr("type", "range")
    .attr("min", range[0])
    .attr("max", range[1])
    .attr("step", 1)
    .property("value", range[1]);

  const max_label = max_wrap
    .append("div")
    .attr("class", "max")
    .html(format_num(range[1]));

  // Prep events.
  let min_value = null;
  let max_value = null;

  // Min events.
  min.on("input", function () {
    min_value = +this.value;
    max_value = +max.node().value;

    min_label.html(format_num(+this.value));

    if (min_value >= max_value) {
      this.value = max_value - 1;
      min_label.html(format_num(max_value - 1));
      return;
    }
  });

  min.on("change", function () {
    const predicate = (d) => d[column] >= min_value && d[column] <= max_value;
    filterData(data, column, predicate);
  });

  // Max events.
  max.on("input", function () {
    min_value = +min.node().value;
    max_value = +this.value;

    // Change actual value
    max_label.html(format_num(+this.value));

    if (max_value <= min_value) {
      this.value = min_value + 1;
      max_label.html(format_num(min_value + 1));
      return;
    }
  });

  max.on("change", function () {
    const predicate = (d) => d[column] >= min_value && d[column] <= max_value;
    filterData(data, column, predicate);
  });
}

// Main control building function.
function buildControls(data) {
  // Set up predicate bases for filtering (showing all by default).
  predicates = [
    { column: "Region", predicate: (d) => d },
    { column: "Life expectancy", predicate: (d) => d },
    { column: "GDP", predicate: (d) => d },
    { column: "Population", predicate: (d) => d },
  ];

  // Add controls.
  buildMultiSelect(data, "Region");
  buildDropdown(data, "Life expectancy");
  buildSlider(data, "GDP");
  buildSlider(data, "Population");
}

/* Main function */
function main(data, base_charts) {
  buildCharts(data, base_charts);
  buildControls(data);
}

/* Fetch data and base chart info */
const data_promise = d3.csv("data/data.csv");
const chart_promises = charts.map((chart) =>
  d3.json(
    `https://public.flourish.studio/visualisation/${chart.id}/visualisation-object.json`
  )
);

Promise.all([data_promise, ...chart_promises]).then((res) =>
  main(res[0], res.slice(1))
);
