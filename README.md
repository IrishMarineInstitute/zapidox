# Welcome to zapidox

zapidox presents an API Documentation style interface for [ERDDAP](https://github.com/IrishMarineInstitute/awesome-erddap)

[Try it live](https://irishmarineinstitute.github.io/zapidox/#https://erddap.marine.ie/erddap/tabledap/IMI-TidePrediction_epa.html)

## How zapidox works

Zapidox is a HTML+javascript application which runs in the browser. Zapidox makes standard requests to the selected [ERDDAP](https://github.com/IrishMarineInstitute/awesome-erddap) server, and renders the result for the user.

For any dataset, zapidox pays particular attention to the <em>zapidox</em> NC_Global attribute, if it exists. The zapidox attribute contains some JSON to name and describe the example queries. Zapidox represents these queries as API methods in the rendered documentation.

Below is an example zapidox attribute entry for a dataset:

```xml
        <!-- zapidox for IMI-TidePrediction_epa -->
        <att name="zapidox"><![CDATA[
[
    {
        "name": "listForecastStations",
        "description": "List the stations having forecast data for the next three days.",
        "formats": [
            ".csv0",
            ".jsonlKVP"
        ],
        "query": "stationID,latitude,longitude&time%3E=now&time%3C=now%2B3d&distinct()"
    },
    {
        "name": "getSeaSurfaceHeightForecast",
        "description": "Get next three days of sea surface height at a specific station.",
        "formats": [
            ".csv0",
            ".jsonlKVP"
        ],
        "query": "time%2Clongitude%2Clatitude%2CstationID%2Csea_surface_height&time%3E=now&time%3C=now+3d&stationID=%22BPNBF050000140001_MODELLED%22"
    }
]
]]></att>
```

## How to add zapidox for my dataset

 1. Use the [zapidox editor](https://irishmarineinstitute.github.io/zapidox/editor/#https://erddap.marine.ie/erddap/tabledap/IMI-TidePrediction_epa.html) for your own dataset, and view the preview.
 2. save the output in your ERDDAP datasets.xml file
 3. touch the dataset's flag file to reload.

That's it! Once the dataset has reloaded, your zapidox will appear.

<b>Hot Tip:</b> Share the link to your dataset's API documentation, by hash linking the dataset's data access form. For example:
<a href="https://irishmarineinstitute.github.io/zapidox/#https://erddap.marine.ie/erddap/tabledap/IMI-TidePrediction_epa.html">https://irishmarineinstitute.github.io/zapidox/#https://erddap.marine.ie/erddap/tabledap/IMI-TidePrediction_epa.html</a>


### Limitations

 * Currently only works for CORS enabled ERDDAP servers.
 * Currently only works for tabledap datasets

