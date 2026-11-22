package com.goosb.nplusone.test;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class SqlSummarizer {

    private static final List<String> CLAUSES = List.of("WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET", "FETCH");

    private SqlSummarizer() {
        // util class
    }

    /**
     * Summarizes a given SQL query.
     *
     * @param sql a query, for example: SELECT * FROM t1 JOIN t2 ON t1.id = t2.t1_id WHERE t1.value > 10 ORDER BY t1.name
     * @return the query summarized, for example: SELECT ... FROM t1 JOIN t2 ... WHERE ... ORDER BY ...
     */
    public static String summarize(
            String sql) {
        if(isBlank(sql)) {
            return "";
        }

        String trimmedSql = sql.replaceAll("\\s+", " ").trim();
        boolean isNotSelectQuery = !Pattern.compile("^SELECT\\b", Pattern.CASE_INSENSITIVE).matcher(trimmedSql).find();
        if(isNotSelectQuery) {
            return trimmedSql.length() <= 140 ? trimmedSql : trimmedSql.substring(0, 137) + "...";
        }

        StringBuilder summary = new StringBuilder("SELECT ...");

        List<String> fromTables = findFromTables(trimmedSql);
        if(!fromTables.isEmpty()) {
            summary.append(" FROM ")
                    .append(String.join(", ", fromTables));
        }

        List<String> joinTables = findJoinTables(trimmedSql);
        if(!joinTables.isEmpty()) {
            summary.append(" JOIN ")
                    .append(String.join(", ", joinTables))
                    .append(" ...");
        }

        for(String clause : CLAUSES) {
            if(Pattern.compile("\\b" + clause.replace(" ", "\\s+") + "\\b", Pattern.CASE_INSENSITIVE).matcher(trimmedSql).find()) {
                summary.append(' ')
                        .append(clause)
                        .append(" ...");
            }
        }

        return summary.toString();
    }

    private static List<String> findFromTables(
            String sql) {
        Matcher from = Pattern.compile(
                "\\bFROM\\s+(.+?)(?=\\s+\\b(?:JOIN|WHERE|GROUP\\s+BY|HAVING|ORDER\\s+BY|LIMIT|OFFSET|FETCH|UNION)\\b|$)",
                Pattern.CASE_INSENSITIVE).matcher(sql);
        if(!from.find() || from.group(1).startsWith("(")) {
            return List.of();
        }
        List<String> tables = new ArrayList<>();
        for(String expression : from.group(1).split(",")) {
            tables.add(expression.trim().split("\\s+")[0]);
        }
        return tables;
    }

    private static List<String> findJoinTables(
            String sql) {
        Matcher joins = Pattern.compile("\\bJOIN\\s+([^\\s,()]+)", Pattern.CASE_INSENSITIVE).matcher(sql);
        List<String> tables = new ArrayList<>();
        while(joins.find()) {
            if(!tables.contains(joins.group(1))) {
                tables.add(joins.group(1));
            }
        }
        return tables;
    }
}
