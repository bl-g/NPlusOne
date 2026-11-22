const SQL_KEYWORDS = new Set([
    "ADD", "ALL", "ALTER", "AND", "AS", "ASC", "BEGIN", "BETWEEN", "BY", "CASE",
    "CREATE", "CROSS", "DELETE", "DESC", "DISTINCT", "DROP", "ELSE", "END", "EXISTS",
    "FETCH", "FROM", "FULL", "GROUP", "HAVING", "IF", "IN", "INNER", "INSERT", "INTO",
    "IS", "JOIN", "LEFT", "LIKE", "LIMIT", "MERGE", "NOT", "NULL", "OFFSET", "ON",
    "OR", "ORDER", "OUTER", "PRIMARY", "REFERENCES", "RIGHT", "SELECT", "SET", "TABLE",
    "THEN", "TOP", "TRUNCATE", "UNION", "UNIQUE", "UPDATE", "USING", "VALUES", "WHEN",
    "WHERE", "WITH"
]);
function isIdentifierStart(character) {
    return (character >= "A" && character <= "Z") ||
            (character >= "a" && character <= "z") ||
            character === "_";
}

function isIdentifierPart(character) {
    return isIdentifierStart(character) ||
            (character >= "0" && character <= "9") ||
            character === "$";
}

function findQuotedTokenEnd(sql, start, quote) {
    let index = start + 1;

    while (index < sql.length) {
        if (sql[index] !== quote) {
            index++;
        } else if (sql[index + 1] === quote) {
            index += 2;
        } else {
            return index + 1;
        }
    }

    return sql.length;
}

function findBracketedTokenEnd(sql, start) {
    let index = start + 1;

    while (index < sql.length) {
        if (sql[index] !== "]") {
            index++;
        } else if (sql[index + 1] === "]") {
            index += 2;
        } else {
            return index + 1;
        }
    }

    return sql.length;
}

function* findSqlTokens(sql) {
    let index = 0;

    while (index < sql.length) {
        const start = index;
        let end;

        if (sql.startsWith("--", index)) {
            end = sql.indexOf("\n", index + 2);
            end = end === -1 ? sql.length : end;
        } else if (sql.startsWith("/*", index)) {
            end = sql.indexOf("*/", index + 2);
            end = end === -1 ? sql.length : end + 2;
        } else if (sql[index] === "'" || sql[index] === "\"" || sql[index] === "`") {
            end = findQuotedTokenEnd(sql, index, sql[index]);
        } else if (sql[index] === "[") {
            end = findBracketedTokenEnd(sql, index);
        } else if (isIdentifierStart(sql[index])) {
            index++;
            while (index < sql.length && isIdentifierPart(sql[index])) {
                index++;
            }
            yield {start, end: index};
            continue;
        } else {
            index++;
            continue;
        }

        yield {start, end};
        index = end;
    }
}

export function formatSql(sql) {
    const value = capitalizeSqlKeywords(sql ?? "");

    return {
        summary: summarizeSql(value),
        full: value
    };
}

function capitalizeSqlKeywords(sql) {
    let result = "";
    let previousEnd = 0;

    for (const {start, end} of findSqlTokens(sql)) {
        const token = sql.substring(start, end);
        result += sql.substring(previousEnd, start);
        result += SQL_KEYWORDS.has(token.toUpperCase()) ? token.toUpperCase() : token;
        previousEnd = end;
    }

    return result + sql.substring(previousEnd);
}

function summarizeSql(sql) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const statementType = normalizedSql.match(/^[a-z]+/i)?.[0]?.toUpperCase();

    switch (statementType) {
        case "SELECT":
            return summarizeSelect(normalizedSql);
        case "INSERT":
            return summarizeInsert(normalizedSql);
        case "UPDATE":
            return summarizeUpdate(normalizedSql);
        case "DELETE":
            return summarizeDelete(normalizedSql);
        case "CREATE":
            return summarizeTableStatement(normalizedSql, "CREATE");
        case "ALTER":
            return summarizeTableStatement(normalizedSql, "ALTER");
        case "DROP":
            return summarizeTableStatement(normalizedSql, "DROP");
        case "TRUNCATE":
            return summarizeTableStatement(normalizedSql, "TRUNCATE");
        case "MERGE":
            return summarizeMerge(normalizedSql);
        default:
            return truncateSql(normalizedSql);
    }
}

function summarizeSelect(sql) {
    const fromTables = extractFromTables(sql);
    const joinedTables = extractMatches(sql, /\bJOIN\s+([^\s,()]+)/gi);
    let summary = "SELECT ...";

    if (fromTables.length > 0) {
        summary += ` FROM ${fromTables.join(", ")}`;
    }
    if (joinedTables.length > 0) {
        summary += ` JOIN ${joinedTables.join(", ")}`;
    }

    return appendPresentClauses(summary, sql, [
        "WHERE",
        "GROUP BY",
        "HAVING",
        "ORDER BY",
        "LIMIT",
        "OFFSET",
        "FETCH"
    ]);
}

function summarizeInsert(sql) {
    const table = extractFirstMatch(sql, /\bINSERT\s+INTO\s+([^\s,(]+)/i);
    let summary = table ? `INSERT INTO ${table} (...)` : "INSERT ...";

    if (/\bVALUES\b/i.test(sql)) {
        return summary + " VALUES (...)";
    }
    if (/\bSELECT\b/i.test(sql)) {
        const selectSql = sql.substring(sql.search(/\bSELECT\b/i));
        return summary + " " + summarizeSelect(selectSql);
    }

    return summary;
}

function summarizeUpdate(sql) {
    const table = extractFirstMatch(sql, /^UPDATE\s+([^\s,()]+)/i);
    const summary = table ? `UPDATE ${table} SET ...` : "UPDATE ...";
    return appendPresentClauses(summary, sql, ["WHERE"]);
}

function summarizeDelete(sql) {
    const table = extractFirstMatch(sql, /\bDELETE\s+FROM\s+([^\s,()]+)/i);
    const summary = table ? `DELETE FROM ${table}` : "DELETE ...";
    return appendPresentClauses(summary, sql, ["WHERE"]);
}

function summarizeTableStatement(sql, operation) {
    const table = extractFirstMatch(
            sql,
            new RegExp(`^\\s*${operation}\\s+TABLE(?:\\s+IF\\s+(?:NOT\\s+)?EXISTS)?\\s+([^\\s,(]+)`, "i"));

    if (!table) {
        return truncateSql(sql);
    }

    return `${operation} TABLE ${table} (...)`;
}

function summarizeMerge(sql) {
    const target = extractFirstMatch(sql, /\bMERGE\s+(?:INTO\s+)?([^\s,()]+)/i);
    const source = extractFirstMatch(sql, /\bUSING\s+([^\s,()]+)/i);
    let summary = target ? `MERGE INTO ${target}` : "MERGE ...";

    if (source) {
        summary += ` USING ${source}`;
    }

    return summary + " ...";
}

function extractFromTables(sql) {
    const fromSegment = extractFirstMatch(
            sql,
            /\bFROM\s+(.+?)(?=\s+\b(?:JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|FETCH|UNION)\b|$)/i);

    if (!fromSegment || fromSegment.startsWith("(")) {
        return [];
    }

    return fromSegment
            .split(",")
            .map(tableExpression => tableExpression.trim().split(/\s+/)[0])
            .filter(Boolean);
}

function extractMatches(sql, pattern) {
    const counts = new Map();
    for (const match of sql.matchAll(pattern)) {
        const table = match[1];
        counts.set(table, (counts.get(table) ?? 0) + 1);
    }
    return [...counts].map(([table, count]) => count > 1 ? `${table} (${count})` : table);
}

function extractFirstMatch(sql, pattern) {
    return sql.match(pattern)?.[1] ?? null;
}

function appendPresentClauses(summary, sql, clauses) {
    for (const clause of clauses) {
        const clausePattern = new RegExp(`\\b${clause.replace(" ", "\\s+")}\\b`, "i");
        if (clausePattern.test(sql)) {
            summary += ` ${clause} ...`;
        }
    }
    return summary;
}

function truncateSql(sql) {
    const maximumLength = 140;
    return sql.length <= maximumLength
            ? sql
            : sql.substring(0, maximumLength - 1).trimEnd() + "…";
}

export function renderHighlightedSql(
        element,
        sql) {
    element.replaceChildren();

    let previousEnd = 0;

    for (const {start, end} of findSqlTokens(sql)) {
        if (start > previousEnd) {
            element.append(document.createTextNode(sql.substring(previousEnd, start)));
        }

        const token = sql.substring(start, end);
        if (SQL_KEYWORDS.has(token.toUpperCase())) {
            const keyword = document.createElement("span");
            keyword.className = "sql-keyword";
            keyword.textContent = token;
            element.append(keyword);
        } else {
            element.append(document.createTextNode(token));
        }

        previousEnd = end;
    }

    if (previousEnd < sql.length) {
        element.append(document.createTextNode(sql.substring(previousEnd)));
    }
}
