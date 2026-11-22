// Text and diagrams from faq-and-example-projects/README.md, sections n-plus-one-def and query-duration.
export const TOUR_ARTICLES = {
    "patterns": {
        "title": "What is a N+1 query pattern, and how does NPlusOne identify it?",
        "sourceUrl": "https://github.com/bl-g/NPlusOne/tree/main/faq-and-example-projects#n-plus-one-def",
        "blocks": [
            {
                "type": "paragraph",
                "html": "A N+1 query pattern occurs if an application uses a SQL query to load a collection of items, followed by one or more additional queries <em>per item</em> to (lazy) load additional values. With a large number of items this implies a large number of queries, which can cause significant time-performance problems due to the overhead associated with each query, in particular the latency between the application server and the database server."
            },
            {
                "type": "paragraph",
                "html": "N+1 query problems are commonly caused by seemingly harmless code that relies on an ORM and involves some form of a loop. For example, see the code below: if the <code>owner</code> field is not part of the field values that are fetched by default when loading a <code>Pet</code>, then each Pet's owner is loaded lazily. In other words, the application sends a single <code>SELECT * FROM Pet</code> query, followed by a <code>SELECT * FROM Owner WHERE id = ?</code> query <em>for each Pet</em>. The strength of an ORM, abstracting away the SQL layer, is in cases like this also its weakness."
            },
            {
                "type": "java",
                "text": "public Set<String> getOwnerNames() {\n    return petRepository.findAll()\n            .stream()\n            .map(pet -> pet.getOwner().getName())\n            .collect(Collectors.toSet());\n}"
            },
            {
                "type": "paragraph",
                "html": "NPlusOne identifies a N+1 query pattern by looking for repeated queries. Specifically, if a certain method triggers the same SQL query multiple times, then NPlusOne considers it a (potential) N+1 query pattern."
            },
            {
                "type": "paragraph",
                "html": "A repeated query is not necessarily a N+1 query problem, or possibly not even a problem at all. NPlusOne cannot reliably use heuristics to distinguish harmless/intentional repeated queries from problematic ones though. Hence, it instead reports all repeated queries, and leaves it to the user to define filters based on the SQL query or strack trace."
            }
        ]
    },
    "query-time": {
        "title": "How is the query duration defined?",
        "sourceUrl": "https://github.com/bl-g/NPlusOne/blob/main/faq-and-example-projects/README.md#query-duration",
        "blocks": [
            {
                "type": "paragraph",
                "html": "NPlusOne shows the time each SQL query takes, and expresses the sum of all query durations as a percentage of the HTTP request duration. Measuring a query's duration is not straightforward though, since there is no universal definition of what should be in- or excluded in a query's execution time. There are many actors and steps involved and definitions differ in which they include: the ORM, the connection pool, the driver, the network, the database. A definition will depend on the layer to focus on and the question that it should answer. For example, if the database should be investigated as a potential bottleneck, then the 'query duration' should only include the steps the database performs. For NPlusOne, the goal is to give the user an idea of the costs of N+1 query issues, and the potential time performance gain of fixing them. Thus it needs a matching definition of 'query duration'."
            },
            {
                "type": "paragraph",
                "html": "N+1 queries hurt time performance because they make an application repeatedly pay some of the overhead costs of a query. For example, sending N requests may involve waiting for database locks or worker threads each time. Focusing exclusively on the database execution time would under-count the real costs of N+1 query issues though: sending N requests also implies N round trips to the database, which means paying network/latency costs N times. Similarly, the driver has to encode and decode N queries. N+1 queries also mean that the ORM has to populate entities and update its persistence context N times. The impact on time-performance is typically smaller here though, and the additional ORM overhead is harder to distinguish from steps which the ORM also had to perform in the absence of N+1 query problems."
            },
            {
                "type": "paragraph",
                "html": "Roughly speaking, NPlusOne defines a query's duration as: database time + network time + (most of the) driver time. This makes the costs of N+1 queries clearly visible, since especially N times the network time will add up quickly and cause time performance issues. NPlusOne relies applying this definition on OpenTelemetry's Java agent, which under the hood instruments JDBC's <code>(Prepared)Statement#execute*</code> methods, such as <code>PreparedStatement#executeQuery</code>. In other words, NPlusOne receives JDBC spans whose start and end time match the execution start and end timestamps of these <code>execute*</code> methods. An <code>execute*</code> method typically starts before the driver starts encoding, thus includes a good part of the driver's work, in addition to the network time and the database time, as well as the time the driver needs to parse the result received off the wire. A driver's configuration impacts the exact steps in- or excluded in the <code>execute*</code> method. This impact is most noticeable in queries with a large result set. Thus, in the case of N+1 queries, it typically won't impact the measured duration of the 'N' queries much (though they may still return an entity or collection), but it is relevant for the '1' query. This is something to keep in mind, and is therefore explained in more detail below."
            },
            {
                "type": "heading",
                "text": "Driver mode impact on measured query time"
            },
            {
                "type": "paragraph",
                "html": "A driver's mode determines how it fetches a query's results from the database: all rows at once (buffered mode), in repeated requests for batches (cursor/fetch-batch) or streamed (continuous streaming). A driver's mode can have a big impact on an application's time (and memory) performance, but also impacts which steps are captured by the <code>(Prepared)Statement#execute*</code> methods. To illustrate, the images below show a simplified representation of all the steps and actors involved in a query."
            },
            {
                "type": "image-pair",
                "label": "Buffered mode",
                "width": 817,
                "height": 258,
                "plain": {
                    "type": "image",
                    "src": "./tour-images/query_steps_a.png?v=202135670146486249731375864071853380605",
                    "alt": "Query steps, buffered mode",
                    "caption": "<strong>Image a</strong>: <em>the steps of a query with buffered driver mode, simplified</em>",
                    "width": 817,
                    "height": 230,
                    "x": 0,
                    "y": 0
                },
                "measured": {
                    "type": "image",
                    "src": "./tour-images/query_steps_b.png?v=56682849742439975872630104074486300282",
                    "alt": "Statement#execute, buffered mode",
                    "caption": "<strong>Image b</strong>: <em>(Prepared)Statement#execute* execution time with buffered driver mode, simplified</em>",
                    "width": 817,
                    "height": 258
                }
            },
            {
                "type": "image-pair",
                "label": "Cursor / fetch-batch mode",
                "width": 680,
                "height": 201,
                "plain": {
                    "type": "image",
                    "src": "./tour-images/query_steps_c.png?v=265876356752158488747667188408818348607",
                    "alt": "Query steps, cursor mode",
                    "caption": "<strong>Image c</strong>: <em>the (bottom half of) steps of a query with cursor/fetch-batch driver mode), simplified</em>",
                    "width": 627,
                    "height": 142,
                    "x": 3,
                    "y": 3
                },
                "measured": {
                    "type": "image",
                    "src": "./tour-images/query_steps_d.png?v=294805878747687247599601338599502192964",
                    "alt": "Statement#execute&*, cursor mode",
                    "caption": "<strong>Image d</strong>: <em>(Prepared)Statement#execute* execution time (bottom half) with cursor/fetch-batch driver mode, simplified</em>",
                    "width": 680,
                    "height": 201
                }
            },
            {
                "type": "paragraph",
                "html": "Image a relates to the buffered mode, which is relatively straightforward: the ORM builds a SQL query, it fetches a TCP connection from a connection pool and the driver binds the parameters and encodes the SQL query into bytes. Next, it sends the encoded query over the network to the database, which then parses it, creates an execution plan, acquires a worker thread, waits for any locks and executes the query. The full results, so all of the rows, are then sent back over the network, so that the driver can decode them again into simple Java objects and let the ORM read them to populate the impacted entities. As shown in image b, with buffered mode the <code>(Prepared)Statement#execute*</code> method captures all of the network and database time and most of the driver's time. Binding the query's parameters and decoding the rows' values typically happen before the <code>execute*</code> method starts, respectively after it ends, so some of the driver's time is not captured."
            },
            {
                "type": "paragraph",
                "html": "Image c shows how the steps differ if the cursor mode is used instead of the buffered mode. The first set of steps (the top half in images a-b) is the same. The difference lies in how the driver and the database interact in fetching the query's results, so image c only shows this part of the query (the bottom half in images a-b). Unlike in the buffered mode, the database does <em>not</em> produce all rows at once. Instead, it returns only a batch over the network. It keeps a cursor in memory to know where its batch ended. The driver and ORM then process this first batch, after which the driver requests the second batch. The database continues at its stored cursor and the process repeats itself from here. Especially if the <code>fetchSize</code> (the size of one batch) is small and the number of rows is large, this can imply that the database server and application are much more 'chatty' than with the buffered mode."
            },
            {
                "type": "paragraph",
                "html": "As shown in image d, with the cursor mode <code>(Prepared)Statement#execute*</code> no longer captures all of the time needed to transfer all of the results/rows. Only the first batch is captured, while every next batch is instead part of the <code>ResultSet#next</code> call (the first call of each batch triggers a new round trip to the database). Finally, a driver could use continuous streaming, in which case the database server pushes the results onto the wire continuously. The <code>execute*</code> methods then finish at the arrival of the first rows, and every <code>ResultSet#next</code> call reads from the socket as needed, rather than sending a new request to the database server. Though this is a different driver mode than the cursor mode, it is equivalent in the sense that the <code>execute*</code> methods no longer capture the transfer of the results (except for the first rows)."
            },
            {
                "type": "paragraph",
                "html": "The main takeaway here is that with a driver that doesn't use the buffered mode, NPlusOne's 'query duration' might under-count the actual time performance costs of N+1 query issues; for large results, the reported duration is a lower bound. However, this applies to queries with a large set of rows, since if all rows fit in the first batch, there is no effective difference between the modes. Thus, it mostly impacts the '1' query, and to a lesser extent the 'N' queries in an N+1 query problem. The actual impact on the measured duration might be small, but it will differ case-by-case. If the reported query time is unexpectedly small compared to the request time, then this might be explained by a driver's fetch settings combined with NPlusOne's definition of 'query duration'."
            }
        ]
    }
};
