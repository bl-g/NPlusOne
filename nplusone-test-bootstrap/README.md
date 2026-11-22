# Test bridge
This project contains a bridge between the N+1 test Java agent and the JUnit extension/rule.
The bridge holds a shared mapping from trace-id to spans. 
The Java agent writes spans to this mapping while a test runs, 
and the extension/rule reads them from it once a test is finished.