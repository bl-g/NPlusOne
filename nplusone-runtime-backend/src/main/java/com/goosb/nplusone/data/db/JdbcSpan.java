package com.goosb.nplusone.data.db;

import java.time.Instant;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

/**
 * A row in the JDBC span table.
 */
public record JdbcSpan(
        String traceId,
        String id,
        String parentId,
        String stackTraceId,
        String sqlId,
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
        // parentId is allowed to be blank (means that it maps to an unassociated row)
        if(isBlank(stackTraceId)) {
            message.append("stackTraceId is null or blank, ");
        }
        if(isBlank(sqlId)) {
            message.append("sqlId is null or blank, ");
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
