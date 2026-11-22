export const FIELD_LABELS = Object.freeze({operation: globalThis.nplusoneCallRequestsTasks ? "Task" : "Request", sql: "SQL", stackTrace: "Stack trace", sqlCount: "SQL count"});
export const MATCH_LABELS = Object.freeze({contains: "Contains", equals: "Equals", regex: "Regex"});
export const COUNT_MATCH_LABELS = Object.freeze({equals: "= Equals", notEquals: "≠ Not equal",
    greaterThan: "> Greater than", greaterOrEqual: "≥ At least", lessThan: "< Less than", lessOrEqual: "≤ At most"});
const FILTER_ID = /^F[1-9][0-9]*$/;

export function validSqlCount(value) {
    return /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
}

export function ruleSetNameKey(name) { return name.trim().toLowerCase(); }

export function uniqueRuleSetName(base, sets) {
    let name = base;
    let number = 2;
    const names = new Set(sets.map(set => ruleSetNameKey(set.name)));
    while (names.has(ruleSetNameKey(name))) name = `${base} ${number++}`;
    return name;
}

export function ruleSetFilename(name, all = false) {
    let base = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 160).replace(/[. ]+$/, "") || "filter-set";
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(base)) base = "filter-set-" + base;
    return `${base}${all ? "-all-filter-sets" : ""}.json`;
}

export function newFilterId(filters) {
    const used = new Set(filters.map(filter => filter.id));
    let number = 1;
    while (used.has(`F${number}`)) number++;
    return `F${number}`;
}

export function regexError(pattern) {
    try { new RegExp(pattern, "i"); return null; }
    catch (error) { return error.message; }
}

function removeInvalidRegexFilters(state) {
    let cleaned = state;
    for (const filter of state.filters) {
        if (filter.match === "regex" && regexError(filter.value) != null) {
            cleaned = removeFilterFromState(cleaned, filter.id);
        }
    }
    return cleaned;
}

function parseFilterDefinitions(value) {
    if (!Array.isArray(value)) throw new Error("This file needs a filters list.");
    const filters = value.map((filter, index) => {
        if (!isFilterCondition(filter) || typeof filter.id !== "string" || !FILTER_ID.test(filter.id)) {
            throw new Error(`Filter ${index + 1} needs a label such as F1, a supported field and match, and nonempty text.`);
        }
        return {id: filter.id, ...conditionFields(filter)};
    });
    const compiled = compileFilterChain([], filters);
    if (!compiled.valid) throw new Error(compiled.error);
    return filters;
}

export function compileFilterChain(chain, filters) {
    const referencedIds = [];
    const references = new Set();
    const fail = error => ({valid: false, error, referencedIds, tree: null, program: []});
    if (!Array.isArray(chain) || !Array.isArray(filters)) {
        return fail("Build the expression with filter labels, AND, OR, and parentheses.");
    }
    const ids = new Set();
    const names = new Set();
    for (const filter of filters) {
        if (typeof filter?.id !== "string" || !FILTER_ID.test(filter.id) || ids.has(filter.id)) {
            return fail("Every filter needs a unique label such as F1 or F2.");
        }
        const nameKey = filterNameKey(filterDisplayName(filter));
        if ((filter.name !== undefined && !validFilterName(filter.name)) || names.has(nameKey)) return fail("Filter names must be unique and contain one to thirteen characters.");
        names.add(nameKey);
        ids.add(filter.id);
    }
    if (chain.length === 0) return {valid: true, error: null, referencedIds, tree: null, program: []};
    const operators = [];
    const program = [];
    const precedence = {OR: 1, AND: 2, NOT: 3};
    let expectsFilter = true;
    for (const token of chain) {
        if (typeof token !== "string") return fail("Expression tokens must be filter labels, AND, OR, or parentheses.");
        if (expectsFilter) {
            if (token === "NOT") {
                operators.push(token);
            } else if (token === "(") {
                operators.push(token);
            } else if (FILTER_ID.test(token)) {
                if (!ids.has(token)) return fail("Unknown filter " + token + ". Choose an existing filter.");
                program.push(token);
                if (!references.has(token)) {
                    references.add(token);
                    referencedIds.push(token);
                }
                expectsFilter = false;
            } else if (token === ")") {
                return fail(operators.includes("(")
                        ? "Empty parentheses need a filter or expression."
                        : "Unexpected closing parenthesis. Remove the extra ')'.");
            } else if (token === "AND" || token === "OR") {
                return fail("Choose a filter or '(' before " + token + ".");
            } else {
                return fail("Unknown expression token '" + token + "'. Choose a filter, AND, OR, or a parenthesis.");
            }
        } else if (token === "AND" || token === "OR") {
            while (operators.length > 0 && operators.at(-1) !== "("
                    && precedence[operators.at(-1)] >= precedence[token]) {
                program.push(operators.pop());
            }
            operators.push(token);
            expectsFilter = true;
        } else if (token === ")") {
            while (operators.length > 0 && operators.at(-1) !== "(") program.push(operators.pop());
            if (operators.pop() !== "(") return fail("Unexpected closing parenthesis. Remove the extra ')'.");
        } else {
            return fail("Add AND or OR between filters and parentheses.");
        }
    }
    if (expectsFilter) return fail("The expression is incomplete. Add a filter after the last operator or '('.");
    if (operators.includes("(")) return fail("A '(' is missing its closing ')'.");
    while (operators.length > 0) program.push(operators.pop());
    const nodes = [];
    for (const token of program) {
        if (token === "NOT") {
            nodes.push({type: token, child: nodes.pop()});
        } else if (token === "AND" || token === "OR") {
            const right = nodes.pop();
            const left = nodes.pop();
            nodes.push({type: token, left, right});
        } else {
            nodes.push({type: "filter", id: token});
        }
    }
    return {valid: true, error: null, referencedIds, tree: nodes[0], program};
}

export function compileFilterQuery(query, filters) {
    const lexed = lexFilterQuery(query);
    const byName = new Map(filters.map(filter => [filterNameKey(filterDisplayName(filter)), filter.id]));
    const tokens = [];
    for (const token of lexed) {
        if (token.kind === "reference" || token.kind === "legacy") {
            const id = byName.get(filterNameKey(token.name));
            if (id == null) return {valid:false,error:"Unknown filter " + token.text,referencedIds:[],tree:null,program:[],tokens:[],suspicious:false};
            tokens.push(id);
        } else if (token.kind === "operator") tokens.push(token.text.toUpperCase());
        else return {valid:false,error:"Use bracketed filter names, AND, OR, NOT and parentheses.",referencedIds:[],tree:null,program:[],tokens:[],suspicious:false};
    }
    const compiled = compileFilterChain(tokens, filters);
    let suspicious = false;
    if (compiled.valid) {
        const signatures = [];
        for (const token of compiled.program) {
            if (token === "NOT") {
                const child = signatures.pop();
                if (child.startsWith("NOT:")) suspicious = true;
                signatures.push("NOT:" + child);
            } else if (token === "AND" || token === "OR") {
                const right = signatures.pop();
                const left = signatures.pop();
                if (left === right || left === "NOT:" + right || right === "NOT:" + left) suspicious = true;
                signatures.push(JSON.stringify([token, ...[left, right].sort()]));
            } else signatures.push(token);
        }
    }
    return {...compiled, tokens, suspicious};
}

export function unconditionallyAppliedFilters(compiled) {
    const ids = new Set();
    if (!compiled.valid || compiled.tree == null) return ids;
    const pending = [compiled.tree];
    while (pending.length > 0) {
        const node = pending.pop();
        if (node.type === "filter") ids.add(node.id);
        else if (node.type === "OR") pending.push(node.left, node.right);
    }
    return ids;
}

export function createRuleSet(name = "Untitled filter set", value = {}) {
    const state = normalizeExclusionState(value);
    const query = typeof value.query === "string" ? value.query : formatFilterChain(state.chain, state.filters);
    const compiled = compileFilterQuery(query, state.filters);
    return {id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name, ...state, query, chain: compiled.valid ? compiled.tokens : []};
}

export function normalizeRuleSetLibrary(value, legacy = null) {
    const ruleSets = [];
    const ids = new Set();
    for (const entry of Array.isArray(value?.ruleSets) ? value.ruleSets : []) {
        if (!isRecord(entry)) continue;
        const base = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : "Untitled filter set";
        const set = createRuleSet(uniqueRuleSetName(base, ruleSets), entry);
        // Earlier versions saved an automatic empty Default placeholder.
        if (value.ruleSets.length === 1 && base === "Default" && !set.filters.length && !set.query.trim()) continue;
        if (typeof entry.id === "string" && entry.id && !ids.has(entry.id)) set.id = entry.id;
        ids.add(set.id);
        ruleSets.push(set);
    }
    if (ruleSets.length === 0 && legacy != null) {
        const migrated = createRuleSet("Imported filters", legacy);
        if (migrated.filters.length > 0) ruleSets.push(migrated);
    }
    return {version: 1, ruleSets, selectedId: ruleSets.some(set => set.id === value?.selectedId)
        ? value.selectedId : ruleSets[0]?.id ?? null};
}

export function serializeRuleSets(ruleSets) {
    const exported = ruleSets.map(set => {
        const compiled = compileFilterQuery(set.query, set.filters);
        if (!compiled.valid) throw new Error(`Fix the expression in “${set.name || "Untitled filter set"}” before exporting.`);
        return {name: set.name || "Untitled filter set", filters: set.filters, query: set.query};
    });
    return JSON.stringify({version: 5, ruleSets: exported}, null, 2) + "\n";
}

export function parseRuleSets(text) {
    let value;
    try { value = JSON.parse(text.replace(/^\uFEFF/, "")); }
    catch { throw new Error("Choose a valid JSON filter-set file."); }
    if (![4, 5].includes(value?.version)) return [createRuleSet("Imported filter set", parseFilterRules(text))];
    if (!Array.isArray(value.ruleSets) || value.ruleSets.length === 0) throw new Error("This file contains no filter sets.");
    return value.ruleSets.map((entry, index) => {
        if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name.trim()
                || typeof entry.query !== "string" || (entry.paused !== undefined && typeof entry.paused !== "boolean")) {
            throw new Error(`Filter set ${index + 1} is invalid.`);
        }
        const filters = parseFilterDefinitions(entry.filters);
        const compiled = compileFilterQuery(entry.query, filters);
        if (!compiled.valid) throw new Error(`The expression in “${entry.name}” is invalid.`);
        const state = removeInvalidRegexFilters({filters, chain: compiled.tokens, paused: entry.paused === true});
        const query = state.filters.length === filters.length ? entry.query : formatFilterChain(state.chain, state.filters);
        return createRuleSet(entry.name.trim(), {...state, query});
    });
}

export function normalizeExclusionState(value) {
    const paused = value?.paused === true;
    if (!isRecord(value)) return {filters: [], chain: [], paused};
    if (Object.hasOwn(value, "filters") || Object.hasOwn(value, "chain")) {
        const filters = [];
        const ids = new Set();
        let valid = Array.isArray(value.filters) && (value.paused === undefined || typeof value.paused === "boolean");
        for (const filter of Array.isArray(value.filters) ? value.filters : []) {
            if (!isFilterCondition(filter) || typeof filter.id !== "string"
                    || !FILTER_ID.test(filter.id) || ids.has(filter.id)) {
                valid = false;
                continue;
            }
            ids.add(filter.id);
            filters.push({id: filter.id, ...conditionFields(filter)});
        }
        const compiled = typeof value.query === "string"
            ? compileFilterQuery(value.query, filters) : compileFilterChain(value.chain, filters);
        return {filters, chain: valid && compiled.valid ? [...(compiled.tokens ?? value.chain)] : [], paused};
    }
    if (Object.hasOwn(value, "groups")) {
        // An invalid AND clause must never be dropped: it could broaden exclusions.
        if (!Array.isArray(value.groups) || !isFilterMode(value.mode)
                || (value.paused !== undefined && typeof value.paused !== "boolean")
                || value.groups.some(group => !isFilterGroup(group))) {
            return {filters: [], chain: [], paused};
        }
        return migrateGroups(value.groups, value.mode, paused);
    }
    const rules = (Array.isArray(value.rules) ? value.rules : [])
            .filter(rule => isFilterCondition(rule)
                    && (rule.enabled === undefined || typeof rule.enabled === "boolean"));
    return migrateGroups(rules.map(rule => ({
        mode: "all", enabled: rule.enabled !== false, conditions: [rule]
    })), "any", paused);
}

export function parseFilterRules(text) {
    let value;
    try {
        value = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
        throw new Error("This file is not valid JSON. Choose a JSON file exported from Filters.");
    }
    if (!isRecord(value)) throw new Error("Choose a JSON file exported from Filters.");
    if (![1, 2, 3].includes(value.version)) {
        throw new Error("Unsupported filter file version. This app supports versions 1, 2, and 3.");
    }
    if (value.paused !== undefined && typeof value.paused !== "boolean") {
        throw new Error("The file's paused setting must be true or false.");
    }
    if (value.version === 3) {
        if (!Array.isArray(value.filters) || !Array.isArray(value.chain)) {
            throw new Error("This version 3 file needs a filters list and a chain of expression tokens.");
        }
        const filters = parseFilterDefinitions(value.filters);
        const compiled = compileFilterChain(value.chain, filters);
        if (!compiled.valid) throw new Error(compiled.error);
        return removeInvalidRegexFilters({filters, chain: [...value.chain], paused: value.paused === true});
    }
    if (value.version === 1) {
        if (!Array.isArray(value.rules)) throw new Error("This version 1 file must contain a rules list.");
        for (const [index, rule] of value.rules.entries()) {
            if (!isFilterCondition(rule) || (rule.enabled !== undefined && typeof rule.enabled !== "boolean")) {
                throw new Error("Rule " + (index + 1) + " is invalid. Each rule needs a supported field, match, and nonempty text value.");
            }
        }
        return removeInvalidRegexFilters(normalizeExclusionState({rules: value.rules, paused: value.paused}));
    }
    if (!Array.isArray(value.groups) || !isFilterMode(value.mode)) {
        throw new Error("This version 2 file needs a groups list and a match mode of 'all' or 'any'.");
    }
    for (const [index, group] of value.groups.entries()) {
        if (!isFilterGroup(group)) {
            throw new Error("Filter group " + (index + 1) + " is invalid. Each group needs an 'all' or 'any' mode and valid conditions. Nested groups are not supported.");
        }
    }
    return removeInvalidRegexFilters(migrateGroups(value.groups, value.mode, value.paused === true));
}

export function removeFilterFromState(state, id) {
    const normalized = normalizeExclusionState(state);
    if (!normalized.filters.some(filter => filter.id === id)) return normalized;
    const filters = normalized.filters.filter(filter => filter.id !== id);
    return {...normalized, filters, chain: pruneFilterChain(normalized.chain, normalized.filters,
        node => node.type === "filter" && node.id === id)};
}

export function removeNegatedFilterFromChain(chain, filters, id) {
    return pruneFilterChain(chain, filters,
        node => node.type === "NOT" && node.child.type === "filter" && node.child.id === id);
}

function pruneFilterChain(chain, filters, shouldRemove) {
    const root = compileFilterChain(chain, filters).tree;
    if (root == null) return chain;
    const results = new Map();
    const tasks = [[root, false]];
    while (tasks.length > 0) {
        const [node, visited] = tasks.pop();
        if (shouldRemove(node)) {
            results.set(node, null);
        } else if (node.type === "filter") {
            results.set(node, node);
        } else if (node.type === "NOT") {
            if (!visited) tasks.push([node, true], [node.child, false]);
            else results.set(node, results.get(node.child) == null ? null : {type: "NOT", child: results.get(node.child)});
        } else if (!visited) {
            tasks.push([node, true], [node.right, false], [node.left, false]);
        } else {
            const left = results.get(node.left);
            const right = results.get(node.right);
            results.set(node, left && right ? {type: node.type, left, right} : left ?? right);
        }
    }
    return treeToChain(results.get(root));
}

function treeToChain(root) {
    if (root == null) return [];
    const chain = [];
    const tasks = [{node: root, precedence: 0}];
    while (tasks.length > 0) {
        const task = tasks.pop();
        if (typeof task === "string") {
            chain.push(task);
        } else if (task.node.type === "filter") {
            chain.push(task.node.id);
        } else if (task.node.type === "NOT") {
            tasks.push({node: task.node.child, precedence: 3}, "NOT");
        } else {
            const node = task.node;
            const precedence = node.type === "AND" ? 2 : 1;
            const wrap = precedence < task.precedence;
            if (wrap) tasks.push(")");
            tasks.push({node: node.right, precedence}, node.type, {node: node.left, precedence});
            if (wrap) tasks.push("(");
        }
    }
    return chain;
}

function migrateGroups(groups, mode, paused) {
    const filters = [];
    const ids = new Map();
    const parts = [];
    for (const group of groups) {
        const references = [];
        for (const condition of group.conditions) {
            const key = conditionKey(condition);
            let id = ids.get(key);
            if (id == null) {
                id = newFilterId(filters);
                ids.set(key, id);
                filters.push({id, ...conditionFields(condition)});
            }
            if (!references.includes(id)) references.push(id);
        }
        if (group.enabled !== false) {
            parts.push(references.flatMap((id, index) => index === 0 ? [id] : [group.mode === "all" ? "AND" : "OR", id]));
        }
    }
    const chain = [];
    for (const part of parts) {
        if (chain.length > 0) chain.push(mode === "all" ? "AND" : "OR");
        if (part.length > 1) chain.push("(", ...part, ")");
        else chain.push(...part);
    }
    return {filters, chain, paused};
}

function isRecord(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFilterMode(mode) {
    return mode === "all" || mode === "any";
}

function isFilterCondition(condition) {
    return isRecord(condition) && typeof condition.field === "string" && typeof condition.match === "string"
            && Object.hasOwn(FIELD_LABELS, condition.field)
            && Object.hasOwn(condition.field === "sqlCount" ? COUNT_MATCH_LABELS : MATCH_LABELS, condition.match)
            && typeof condition.value === "string" && (condition.match === "regex" ? condition.value.length > 0 : condition.value.trim() !== "")
            && (condition.field !== "sqlCount" || validSqlCount(condition.value))
            && (condition.name === undefined || validFilterName(condition.name))
            && !Object.hasOwn(condition, "groups") && !Object.hasOwn(condition, "conditions");
}

function isFilterGroup(group) {
    return isRecord(group) && isFilterMode(group.mode)
            && (group.enabled === undefined || typeof group.enabled === "boolean")
            && !Object.hasOwn(group, "groups") && Array.isArray(group.conditions)
            && group.conditions.length > 0 && group.conditions.every(isFilterCondition);
}

function conditionFields(condition) {
    return {...(condition.name === undefined ? {} : {name: condition.name.trim()}), field: condition.field, match: condition.match,
        value: condition.field === "sqlCount" ? String(Number(condition.value))
            : condition.match === "regex" ? condition.value : condition.value.trim()};
}

function conditionKey(condition) {
    return JSON.stringify([condition.field, condition.match,
        condition.field === "sqlCount" ? String(Number(condition.value))
            : condition.match === "regex" ? condition.value : condition.value.trim().toLowerCase()]);
}

export function applyExclusionRules(serverRows, unassociatedRows, state) {
    const normalized = normalizeExclusionState(state);
    const compiled = compileFilterChain(normalized.chain, normalized.filters);
    if (normalized.paused || compiled.tree == null) {
        return {serverRows, unassociatedRows, hiddenGroupCount: 0, hiddenSqlRowCount: 0};
    }
    // Invalid stored patterns cannot crash the stream or partially apply an expression.
    if (normalized.filters.some(filter => filter.match === "regex" && regexError(filter.value) != null)) {
        return {serverRows, unassociatedRows, hiddenGroupCount: 0, hiddenSqlRowCount: 0};
    }
    const definitions = new Map(normalized.filters.map(filter => [filter.id, {...filter,
        needle: filter.value.toLowerCase(), pattern: filter.match === "regex" ? new RegExp(filter.value, "i") : null}]));
    const matches = (operation, sqlRow) => {
        const fields = {operation,
            sql: sqlRow?.query == null ? null : String(sqlRow.query),
            stackTrace: sqlRow?.stackTrace == null ? null : String(sqlRow.stackTrace),
            sqlCount: sqlRow == null ? null : sqlRow.count ?? 1};
        const values = [];
        for (const token of compiled.program) {
            if (token === "NOT") {
                values.push(!values.pop());
            } else if (token === "AND" || token === "OR") {
                const right = values.pop();
                const left = values.pop();
                values.push(token === "AND" ? left && right : left || right);
            } else {
                const filter = definitions.get(token);
                const text = fields[filter.field];
                if (filter.field === "sqlCount") {
                    const threshold = Number(filter.value);
                    values.push(text != null && (filter.match === "equals" ? text === threshold
                        : filter.match === "notEquals" ? text !== threshold
                        : filter.match === "greaterThan" ? text > threshold
                        : filter.match === "greaterOrEqual" ? text >= threshold
                        : filter.match === "lessThan" ? text < threshold : text <= threshold));
                } else values.push(text != null && (filter.match === "regex" ? filter.pattern.test(text)
                    : filter.match === "equals" ? text.toLowerCase() === filter.needle : text.toLowerCase().includes(filter.needle)));
            }
        }
        return values[0];
    };
    let hiddenGroupCount = 0;
    let hiddenSqlRowCount = 0;
    const visibleServerRows = [];
    const visibleUnassociatedRows = [];
    for (const row of serverRows) {
        const sqlRows = row.sqlRows ?? [];
        const operation = row.operation == null ? null : String(row.operation);
        // Missing SQL is not evidence that NOT SQL matches an entire operation.
        if (sqlRows.length === 0 && compiled.referencedIds.every(id => definitions.get(id).field === "operation")
                && matches(operation, null)) {
            hiddenGroupCount++;
            hiddenSqlRowCount += sqlRows.length;
            continue;
        }
        const visibleSqlRows = sqlRows.filter(sqlRow => !matches(operation, sqlRow));
        hiddenSqlRowCount += sqlRows.length - visibleSqlRows.length;
        if (sqlRows.length > 0 && visibleSqlRows.length === 0) hiddenGroupCount++;
        else visibleServerRows.push(visibleSqlRows.length === sqlRows.length ? row : {...row, sqlRows: visibleSqlRows});
    }
    for (const row of unassociatedRows) {
        if (matches("Unassociated", row)) {
            hiddenGroupCount++;
            hiddenSqlRowCount++;
        } else {
            visibleUnassociatedRows.push(row);
        }
    }
    return {serverRows: visibleServerRows, unassociatedRows: visibleUnassociatedRows, hiddenGroupCount, hiddenSqlRowCount};
}

// Expressions resolve user-facing names to stable IDs before evaluating conditions.
export function filterDisplayName(filter) { return filter.name ?? filter.id; }
export function filterNameKey(name) { return String(name).trim().normalize("NFC").toLowerCase(); }
export function validFilterName(name) {
    return typeof name === "string" && name.trim().length > 0
        && Array.from(name.trim()).length <= 13 && !/[\r\n]/.test(name);
}
export function filterReference(filter) {
    return "[" + filterDisplayName(filter).replaceAll("]", "]]") + "]";
}
export function formatFilterChain(chain, filters) {
    const byId = new Map(filters.map(filter => [filter.id, filter]));
    return chain.map(token => byId.has(token) ? filterReference(byId.get(token)) : token).join(" ");
}
export function nextFilterName(filters) {
    const used = new Set(filters.map(filter => filterNameKey(filterDisplayName(filter))));
    for (let number = 1; number <= 999999; number++) {
        const name = "Filter #" + number;
        if (!used.has(filterNameKey(name))) return name;
    }
    throw new Error("No default filter names remain available.");
}
export function lexFilterQuery(query) {
    const tokens = [];
    for (let index = 0; index < query.length;) {
        if (/\s/.test(query[index])) { index++; continue; }
        const start = index;
        if (query[index] === "[") {
            index++;
            let name = "";
            let closed = false;
            while (index < query.length) {
                if (query[index] !== "]") name += query[index++];
                else if (query[index + 1] === "]") { name += "]"; index += 2; }
                else { index++; closed = true; break; }
            }
            tokens.push({kind: closed ? "reference" : "invalid", name, start, end: index, text: query.slice(start, index)});
        } else if (query[index] === "(" || query[index] === ")") {
            index++;
            tokens.push({kind: "operator", start, end: index, text: query[start]});
        } else {
            while (index < query.length && !/[\s()[\]]/.test(query[index])) index++;
            if (index === start) index++;
            const text = query.slice(start, index);
            const kind = /^(AND|OR|NOT)$/i.test(text) ? "operator" : /^F[1-9][0-9]*$/i.test(text) ? "legacy" : "invalid";
            tokens.push({kind, name: text, start, end: index, text});
        }
    }
    return tokens;
}
export function renameFilterReferences(query, oldName, newName) {
    let output = "";
    let offset = 0;
    for (const token of lexFilterQuery(query)) {
        if ((token.kind === "reference" || token.kind === "legacy") && filterNameKey(token.name) === filterNameKey(oldName)) {
            output += query.slice(offset, token.start) + (newName == null ? "" : filterReference({name: newName}));
            offset = token.end;
        }
    }
    return output + query.slice(offset);
}
