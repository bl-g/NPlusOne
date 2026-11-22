# NPlusOne Backend
The NPlusOne backend receives OpenTelemetry traces and produces rows representing server operations and their associated SQL queries.
Clients can subscribe to a live stream of rows or search for previously stored rows.

## API
The backend receives OTLP `ExportTraceServiceRequest` messages over gRPC. 
It stores the spans in a SQLite database and combines server spans with their JDBC spans to create `RowUpserts`. 
Rows include server operation details and SQL queries grouped by exact SQL text and call-site stack trace.

The backend exposes these HTTP endpoints:

| Endpoint | Description |
| --- | --- |
| `GET /api/rows/live` | Server-Sent Events stream of new and updated rows. |
| `GET /api/rows/search-page` | Paginated search of stored rows. Accepts optional `startDate`, `endDate`, and `cursor` parameters, and a `pageSize` parameter (default `100`). |

The live stream sends an immediate heartbeat comment, followed by heartbeats every 15 seconds.
Completion and disconnect callbacks release the subscriber slot. 
Capacity rejections return HTTP `503` without a JSON body.
Live events are not replayed across a disconnected interval; search can be used to inspect stored rows from that period.

Both endpoints return a similar response body format. 
`GET /api/rows/search-page` returns a page with the rows and, when more rows are available, a cursor for the next page. See below.
`GET /api/rows/live` endpoint sends the same row objects as Server-Sent Event data in a `rows-upserts` event. 
Its event payload is the same as shown below, but only holds the `rowUpserts` field, not the `nextCursor` field.

```json
{
  "rowUpserts": {
    "rows": [
      {
        "id": "4f3c2a1b9d8e7f60",
        "start": "2027-01-15T10:30:00Z",
        "rowType": "SERVER",
        "durationMillis": 42,
        "jdbcDurationMillis": 16.5,
        "operation": "GET /api/customers",
        "sqlRows": [
          {
            "start": "2025-01-15T10:30:00.012Z",
            "count": 3,
            "jdbcDurationMillis": 16.5,
            "stackTrace": "at com.example.CustomerRepository.findById(CustomerRepository.java:42)",
            "query": "SELECT * FROM customer WHERE id = ?"
          }
        ]
      },
      {
        "id": "8a7b6c5d4e3f2a10",
        "start": "2027-01-15T10:31:00Z",
        "rowType": "UNASSOCIATED",
        "jdbcDurationMillis": 2.75,
        "stackTrace": "at com.example.OrderRepository.findById(OrderRepository.java:27)",
        "query": "SELECT * FROM orders WHERE id = ?"
      }
    ]
  },
  "nextCursor": "eyJzdGFydCI6IjIwMjUtMDEtMTVUMTA6MzA6MDBaIn0="
}
```

The response fields are:

| Field | Description |
| --- | --- |
| `rowUpserts` | Container for the rows in this page. |
| `rowUpserts.rows` | Array of server and unassociated rows. |
| `nextCursor` | Opaque cursor to pass as the `cursor` query parameter for the next page. It is `null` on the last page. |
| `id` | Stable identifier for a row, derived from the trace and span IDs. |
| `start` | Start time as an ISO-8601 timestamp. For a server row this is the server span start; for an SQL row it is the JDBC span start. |
| `rowType` | `SERVER` for a server operation or `UNASSOCIATED` for a JDBC span that could not be linked to a server span. |
| `durationMillis` | Server operation duration in milliseconds, retaining fractional milliseconds. Present on `SERVER` rows. |
| `jdbcDurationMillis` | Sum of all associated JDBC execution span durations in milliseconds, retaining fractional milliseconds. Present on `SERVER` rows. Overlapping executions are summed, so this can exceed `durationMillis`. Calculated from the persisted span timestamps for both live updates and searches. |
| `operation` | Server operation name. Typically the invoked endpoint. Present on `SERVER` rows. |
| `sqlRows` | SQL query groups associated with a `SERVER` row. |
| `sqlRows[].count` | Number of executions represented by the SQL query group. |
| `sqlRows[].jdbcDurationMillis` | Sum of the JDBC execution span durations for this SQL query group, in milliseconds. |
| `sqlRows[].stackTrace` | Call-site stack trace that triggered the SQL query. |
| `sqlRows[].query` | SQL query text. |
| `stackTrace` | Call-site stack trace. Present directly on `UNASSOCIATED` rows. |
| `query` | SQL query text. Present directly on `UNASSOCIATED` rows. |

`UNASSOCIATED` rows also include `jdbcDurationMillis` for their single JDBC execution. All timing values retain fractional milliseconds; the frontend rounds only for display.

## Configuration
The backend can be configured with the following Spring properties:

| Property | Default | Description |
| --- | --- | --- |
| `server.port` | `8081` | HTTP API port. |
| `nplusone.otlp-port` | `4317` | OTLP/gRPC receiver port. |
| `nplusone.database-path` | `nplusone.db` | Path to the SQLite database file. |
| `nplusone.frontend-origin` | `http://localhost:8082` | Allowed origin for frontend requests to the rows API. |
| `nplusone.live-updates.queue-capacity` | `10` | Maximum queued delivery tasks per live subscriber, including heartbeats, plus one active send. Minimum `1`. A full queue closes the publisher and requests disconnection. Limits tasks, not payload size. |
| `nplusone.live-updates.max-subscribers` | `10` | Maximum registered live subscribers. Minimum `1`. Additional subscriptions receive HTTP `503`. Excludes workers still exiting after removal. |
