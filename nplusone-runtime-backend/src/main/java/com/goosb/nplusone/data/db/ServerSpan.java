package com.goosb.nplusone.data.db;

import java.time.Instant;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

/**
 * A row in the Server span table.
 */
public record ServerSpan(
        String traceId,
        String id,
        String operation,
        Instant start,
        Instant end) {

    public String validate() {
        StringBuilder message = new StringBuilder();

        if(isBlank(traceId)) {
            message.append("traceId is null or blank, ");
        }
        if(isBlank(id)) {
            message.append("id is null or blank, ");
        }
        if(isBlank(operation)) {
            message.append("operation is null or blank, ");
        }
        if(start == null) {
            message.append("start is null, ");
        }
        if(end == null) {
            message.append("end is null, ");
        }

        if(!message.isEmpty()) {
            message.setLength(message.length() - 2); // remove trailing ", "
        }

        return message.toString();
    }
}
