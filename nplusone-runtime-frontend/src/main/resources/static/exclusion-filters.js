import {requestText} from "./request-terminology.js?v=9195521797058750261190268690836445467";
import {
    FIELD_LABELS, MATCH_LABELS, COUNT_MATCH_LABELS, validSqlCount,
    filterDisplayName, filterNameKey, validFilterName, filterReference, formatFilterChain, nextFilterName, lexFilterQuery, renameFilterReferences,
    ruleSetNameKey, uniqueRuleSetName, ruleSetFilename, newFilterId, compileFilterQuery,
    applyExclusionRules, removeFilterFromState, removeNegatedFilterFromChain, createRuleSet, normalizeRuleSetLibrary, unconditionallyAppliedFilters,
    serializeRuleSets, parseRuleSets, regexError
} from "./filter-model.js?v=96746998124892846094911012588429907879";
export * from "./filter-model.js?v=96746998124892846094911012588429907879";
import {createLongestQueriesControl} from "./longest-queries.js?v=2951551551764203624";
import {setButtonIcon, createToolbarIcon} from "./toolbar-icons.js?v=17145807429823737765";

const STORAGE_KEY = "nplusone.rule-sets.v1";
const LEGACY_KEY = "nplusone.exclusion-filters.v1";

export function createExclusionFilters(container, onChange, {temporary = false} = {}) {
    const events = new AbortController();
    let library = temporary ? normalizeRuleSetLibrary(null) : readLibrary();
    let editingId = null;
    let highlightedId = null;
    let importQueue = [];
    let replacement = null;
    let firstImportedId = null;
    let allowDraftAction = false;
    let pendingDraftAction = null;
    const emptySet = {id: null, name: "", query: "", filters: [], chain: [], paused: true};
    const current = () => library.ruleSets.find(set => set.id === library.selectedId) ?? emptySet;
    container.classList.add("exclusion-filters");

    const panel = el("div", "exclusion-panel");
    const header = el("div", "exclusion-header");
    const disclosure = button("Filters", "exclusion-summary");
    setButtonIcon(disclosure, 'filters');
    const disclosureChevron = createToolbarIcon('expand');
    disclosureChevron.classList.add('filter-disclosure-chevron');
    disclosure.append(disclosureChevron);
    disclosure.setAttribute("aria-expanded", "false");
    disclosure.setAttribute("aria-controls", "exclusion-body");
    const disclosureGroup = el('div', 'segmented-control filter-disclosure-group');
    disclosureGroup.append(disclosure);
    const toggle = button("Applied", "exclusion-button exclusion-toggle");
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", "Apply filters");
    const toggleGroup = el('div', 'segmented-control filter-toggle-group');
    toggleGroup.setAttribute('role', 'group');
    toggleGroup.setAttribute('aria-label', 'Filter application');
    toggleGroup.append(toggle);
    const body = el("div", "exclusion-body");
    body.id = "exclusion-body";
    body.hidden = true;
    disclosure.addEventListener("click", () => {
        body.hidden = !body.hidden;
        disclosure.setAttribute("aria-expanded", String(!body.hidden));
    });
    toggle.addEventListener("click", () => {
        current().paused = !current().paused;
        persist();
        renderQuery();
        onChange();
    });
    const headerHint = el("span", "exclusion-hint exclusion-header-hint");
    headerHint.append(requestText("Write a filter to hide irrelevant requests or SQL queries. Negate a filter to search for specific requests or queries."));
    const longestQueries = createLongestQueriesControl(onChange, {temporary});
    header.append(disclosureGroup, toggleGroup, headerHint, longestQueries.element);

    const setControls = el("section", "ruleset-controls");
    setControls.setAttribute("aria-label", "Saved filter sets");
    const setRow = el("div", "ruleset-row");
    const setFields = el("div", "ruleset-fields");
    const setSelect = select({}, "ruleset-select");
    const nameInput = input("ruleset-name");
    nameInput.maxLength = 120;
    setFields.append(field("Filter set", setSelect), field("Name", nameInput));
    setSelect.addEventListener("change", () => {
        library.selectedId = setSelect.value;
        resetForm();
        persist();
        loadSet();
        onChange();
    });
    nameInput.addEventListener("input", validateName);
    nameInput.addEventListener("change", commitName);
    nameInput.addEventListener("blur", () => {
        if (!commitName()) {
            nameInput.value = current().name;
            nameInput.setCustomValidity("");
            nameInput.removeAttribute("aria-invalid");
            nameError.textContent = "The name was not changed. Choose a unique, nonempty name.";
        }
    });
    nameInput.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); if (commitName()) nameInput.blur(); }
    });
    const setActions = el("div", "ruleset-actions");
    const newButton = button("New", "exclusion-button ruleset-new");
    const duplicateButton = button("Duplicate", "exclusion-button ruleset-duplicate");
    const deleteButton = button("Delete", "exclusion-button ruleset-delete");
    const exportScope = select({current: "This filter set", all: "All filter sets"}, "ruleset-export-scope");
    exportScope.setAttribute("aria-label", "Filter sets to export");
    const exportButton = button("Export", "exclusion-button exclusion-export");
    const importButton = button("Import", "exclusion-button exclusion-import");
    for (const [control, icon] of [[newButton, 'new'], [duplicateButton, 'duplicate'],
        [deleteButton, 'delete'], [exportButton, 'export'], [importButton, 'import']]) {
        setButtonIcon(control, icon);
    }
    const fileInput = input("filter-import-file");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.hidden = true;
    fileInput.setAttribute("aria-label", "Import filter sets from JSON");
    const transferActions = el("div", "ruleset-transfer");
    transferActions.append(exportScope, exportButton, importButton, fileInput);
    setActions.append(newButton, duplicateButton, deleteButton, transferActions);
    const deleteConfirm = el("div", "ruleset-delete-confirm");
    deleteConfirm.hidden = true;
    const confirmText = el("span", "");
    const confirmDelete = button("Delete filter set", "exclusion-button ruleset-confirm-delete");
    const cancelDelete = button("Cancel", "exclusion-button");
    deleteConfirm.append(confirmText, confirmDelete, cancelDelete);
    const libraryError = el("p", "exclusion-error ruleset-error");
    libraryError.setAttribute("role", "alert");
    libraryError.hidden = true;
    const nameError = el("p", "exclusion-error ruleset-name-error");
    nameError.hidden = true;
    nameError.id = "ruleset-name-error";
    nameError.setAttribute("role", "alert");
    nameInput.setAttribute("aria-describedby", nameError.id);
    const importConfirm = el("div", "ruleset-import-confirm");
    importConfirm.hidden = true;
    const replaceText = el("span", "");
    replaceText.setAttribute("role", "alert");
    const replaceYes = button("Yes", "exclusion-button ruleset-replace-yes");
    const replaceNo = button("No", "exclusion-button ruleset-replace-no");
    importConfirm.append(replaceText, replaceYes, replaceNo);
    replaceYes.addEventListener("click", () => {
        if (!replacement) return;
        acceptImport(replacement);
        replacement = null;
        processImports();
    });
    replaceNo.addEventListener("click", () => { replacement = null; processImports(); });
    setRow.append(setFields, setActions);
    setControls.append(setRow, nameError, deleteConfirm, importConfirm, libraryError);
    const uniqueName = base => uniqueRuleSetName(base, library.ruleSets);
    const addSet = set => {
        library.ruleSets.push(set);
        library.selectedId = set.id;
        resetForm();
        persist();
        loadSet();
        onChange();
    };
    newButton.addEventListener("click", () => {
        addSet(createRuleSet(uniqueName(current().id == null && nameInput.value.trim() ? nameInput.value.trim() : "New filter set")));
        nameInput.focus();
        nameInput.select();
    });
    duplicateButton.addEventListener("click", () => {
        addSet(createRuleSet(uniqueName(`${current().name || "Untitled filter set"} copy`), current()));
        nameInput.focus();
        nameInput.select();
    });
    deleteButton.addEventListener("click", () => {
        confirmText.textContent = `Delete “${current().name || "Untitled filter set"}”?`;
        deleteConfirm.hidden = false;
        confirmDelete.focus();
    });
    cancelDelete.addEventListener("click", () => { deleteConfirm.hidden = true; deleteButton.focus(); });
    confirmDelete.addEventListener("click", () => {
        const index = library.ruleSets.findIndex(set => set.id === library.selectedId);
        library.ruleSets.splice(index, 1);

        library.selectedId = library.ruleSets[Math.min(index, library.ruleSets.length - 1)]?.id ?? null;
        resetForm();
        persist();
        loadSet();
        onChange();
    });
    exportButton.addEventListener("click", () => {
        libraryError.hidden = true;
        try {
            const text = serializeRuleSets(exportScope.value === "all" ? library.ruleSets : [current()]);
            const url = URL.createObjectURL(new Blob([text], {type: "application/json"}));
            const link = el("a", "");
            link.href = url;
            link.download = ruleSetFilename(current().name, exportScope.value === "all");
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { showLibraryError(error.message); }
    });
    importButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        importButton.disabled = true;
        libraryError.hidden = true;
        try {
            // Validate the whole file before changing any sets, then ask about each conflict.
            const sets = parseRuleSets(await file.text());
            const paused = current().paused;
            for (const set of sets) set.paused = paused;
            for (const set of sets) {
                if (set.name === "Imported filter set") set.name = file.name.replace(/\.json$/i, "");
            }
            guardDraft(() => {
                importQueue = sets;
                firstImportedId = null;
                processImports();
            });
        } catch (error) { showLibraryError(error.message); }
        finally { importButton.disabled = replacement != null || importQueue.length > 0; fileInput.value = ""; }
    });

    const draftDialog = el("dialog", "filter-draft-dialog");
    draftDialog.setAttribute("aria-labelledby", "filter-draft-question");
    const draftQuestion = el("p", "");
    draftQuestion.id = "filter-draft-question";
    const draftActions = el("div", "filter-draft-actions");
    const draftSave = button("Save", "exclusion-button exclusion-primary filter-draft-save");
    const draftDiscard = button("Discard", "exclusion-button filter-draft-discard");
    const draftCancel = button("Cancel", "exclusion-button filter-draft-cancel");
    draftActions.append(draftSave, draftDiscard, draftCancel);
    draftDialog.append(draftQuestion, draftActions);
    panel.append(draftDialog);
    function dirtyFilter() {
        const original = current().filters.find(filter => filter.id === editingId);
        return !!original && (filterNameInput.value.trim() !== filterDisplayName(original) || fieldInput.value !== original.field || matchInput.value !== original.match
            || valueInput.value !== original.value);
    }
    function updateEditButtons() {
        for (const row of panel.querySelectorAll(".filter-definition")) {
            row.querySelector(".exclusion-edit").disabled = row.dataset.filterId === editingId;
        }
    }
    function guardDraft(action) {
        if (!dirtyFilter()) { action(); return; }
        pendingDraftAction = action;
        draftQuestion.textContent = "Save changes to filter " + filterDisplayName(current().filters.find(filter => filter.id === editingId)) + " before continuing?";
        draftDialog.showModal();
        draftSave.focus();
    }
    function finishDraftAction() {
        const action = pendingDraftAction;
        pendingDraftAction = null;
        draftDialog.close();
        allowDraftAction = true;
        try { action?.(); } finally { allowDraftAction = false; }
    }
    draftSave.addEventListener("click", () => {
        draftDialog.close();
        form.requestSubmit();
        if (editingId != null) { pendingDraftAction = null; valueInput.focus(); return; }
        finishDraftAction();
    });
    draftDiscard.addEventListener("click", () => {
        const original = current().filters.find(filter => filter.id === editingId);
        if (original) {
            filterNameInput.value = filterDisplayName(original);
            fieldInput.value = original.field;
            updateMatchOptions();
            matchInput.value = original.match;
            valueInput.value = original.value;
            validateFilterValue();
        }
        finishDraftAction();
    });
    draftCancel.addEventListener("click", () => { pendingDraftAction = null; draftDialog.close(); });
    draftDialog.addEventListener("cancel", () => { pendingDraftAction = null; });
    panel.addEventListener("click", event => {
        if (allowDraftAction || !dirtyFilter()) return;
        const action = event.target.closest(".exclusion-edit, .exclusion-apply, .exclusion-remove, .exclusion-cancel-edit, .ruleset-new, .ruleset-duplicate, .ruleset-delete, .ruleset-confirm-delete, .exclusion-import, .exclusion-export");
        if (!action || action.disabled) return;
        if (action.matches(".exclusion-remove") && action.closest(".filter-definition")?.dataset.filterId === editingId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        guardDraft(() => action.click());
    }, true);
    setSelect.addEventListener("change", event => {
        if (allowDraftAction || !dirtyFilter()) return;
        const selectedId = setSelect.value;
        setSelect.value = library.selectedId;
        event.stopImmediatePropagation();
        guardDraft(() => { setSelect.value = selectedId; setSelect.dispatchEvent(new Event("change", {bubbles:true})); });
    }, true);
    window.addEventListener("beforeunload", event => {
        if (temporary) return;
        if (dirtyFilter()) { event.preventDefault(); event.returnValue = ""; }
    }, {signal: events.signal});

    const querySection = el("section", "filter-query-section");
    const queryLabel = el("label", "exclusion-label");
    queryLabel.append(el("span", "filter-hide-label", "Hide"), document.createTextNode(" rows matching"));

    queryLabel.htmlFor = "filter-query";
    const queryEditor = el("div", "filter-query-editor");
    const highlight = el("pre", "filter-query-highlight");
    highlight.setAttribute("aria-hidden", "true");
    const queryInput = el("textarea", "filter-query-input");
    queryInput.id = "filter-query";
    queryInput.rows = 1;
    queryInput.spellcheck = false;
    queryInput.autocomplete = "off";
    queryInput.setAttribute("autocapitalize", "off");
    queryInput.setAttribute("aria-describedby", "filter-query-hint filter-query-scope filter-query-error filter-query-warning");
    queryInput.placeholder = "([F1] OR [F2]) AND NOT [F3]";
    const queryHelp = el("div", "filter-query-help");
    const queryScope = el("p", "exclusion-hint", requestText("Request filters affect whole requests; other filters affect individual SQL entries."));
    queryScope.id = "filter-query-scope";
    const queryHint = el("p", "exclusion-hint", "Combine [filters] with AND, OR, NOT and parentheses.");
    queryHint.id = "filter-query-hint";
    queryHint.append(document.createTextNode(" "), el("span", "filter-query-order", "Applies NOT first, then AND, then OR."));
    queryHelp.append(queryHint, queryScope);
    const queryError = el("p", "exclusion-error filter-query-error");
    queryError.id = "filter-query-error";
    queryError.setAttribute("role", "alert");
    const queryWarning = el("p", "filter-query-warning");
    queryWarning.id = "filter-query-warning";
    queryWarning.setAttribute("role", "status");
    const queryHeading = el("div", "filter-query-heading");
    queryHeading.append(queryLabel, queryEditor, queryHelp);
    queryEditor.append(highlight, queryInput);
    querySection.append(queryHeading, queryError, queryWarning);
    queryInput.addEventListener("input", () => {
        current().query = queryInput.value;
        const compiled = compileFilterQuery(current().query, current().filters);
        current().chain = compiled.valid ? compiled.tokens : [];
        persist();
        renderQuery();
        onChange();
    });
    queryInput.addEventListener("click", () => {
        if (queryInput.selectionStart !== queryInput.selectionEnd) return;
        const position = queryInput.selectionStart;
        for (const token of lexFilterQuery(queryInput.value)) {
            if ((token.kind === "reference" || token.kind === "legacy") && position >= token.start && position <= token.end) {
                const definition = current().filters.find(filter => filterNameKey(filterDisplayName(filter)) === filterNameKey(token.name));
                if (definition) highlightFilter(definition.id);
                break;
            }
        }
    });
    queryInput.addEventListener("scroll", () => {
        highlight.scrollTop = queryInput.scrollTop;
        highlight.scrollLeft = queryInput.scrollLeft;
    });
    new ResizeObserver(() => {
        // Match the textarea's wrapping width even when its scrollbar is visible.
        highlight.style.width = `${queryInput.clientWidth + 2}px`;
        highlight.scrollTop = queryInput.scrollTop;
    }).observe(queryInput);

    const filterSection = el("section", "filter-definition-section");
    const form = el("form", "exclusion-form");
    const formTitle = el("strong", "exclusion-form-title");
    let suggestedFilterName = nextFilterName(current().filters);
    const filterNameEditor = el("span", "filter-name-editor");
    const filterModeLabel = el("label", "filter-mode-label", "Create");
    filterModeLabel.htmlFor = "filter-name";
    const filterNameInput = input("filter-name");
    filterNameInput.value = suggestedFilterName;
    filterNameInput.setAttribute("aria-label", "Filter name (up to thirteen characters)");
    filterNameInput.autocomplete = "off";
    filterNameInput.spellcheck = false;
    filterNameInput.setAttribute("aria-describedby", "filter-value-error");
    filterNameEditor.append(filterModeLabel, filterNameInput);
    formTitle.append(filterNameEditor);
    const fields = el("div", "exclusion-form-fields");
    const fieldInput = select(FIELD_LABELS, "exclusion-field");
    const matchInput = select(MATCH_LABELS, "exclusion-match");
    const valueInput = input("exclusion-value");
    valueInput.required = true;
    valueInput.placeholder = "Text to match";
    valueInput.autocomplete = "off";
    valueInput.spellcheck = false;
    const valueField = field("Value", valueInput);
    valueField.classList.add("exclusion-value-field");
    const submit = button("Add filter", "exclusion-button exclusion-primary");
    submit.type = "submit";
    filterActionIcon(submit, "add", "Add filter");
    const cancel = button("Cancel", "exclusion-button exclusion-cancel-edit");
    filterActionIcon(cancel, "cancel", "Clear / cancel filter");
    cancel.hidden = false;
    fields.append(field("Field", fieldInput), field("Match", matchInput), valueField);
    const createActions = el("div", "filter-create-actions");
    const actionButtons = el("div", "filter-editor-actions");
    actionButtons.append(submit, cancel);
    createActions.append(formTitle, actionButtons);
    const formError = el("p", "exclusion-error exclusion-form-error");
    formError.id = "filter-value-error";
    valueInput.setAttribute("aria-describedby", formError.id);
    formError.hidden = true;
    formError.setAttribute("role", "alert");
    form.append(createActions, fields, formError);
    cancel.addEventListener("click", () => {
        const creating = editingId == null;
        resetForm();
        if (creating) {
            fieldInput.value = "operation";
            updateMatchOptions();
            matchInput.value = "contains";
            updateValuePlaceholder();
        }
        valueInput.focus();
    });
    filterNameInput.addEventListener("input", () => { filterNameInput.value = Array.from(filterNameInput.value).slice(0, 13).join(""); });
    form.addEventListener("input", () => { formError.hidden = true; validateFilterValue(); });
    matchInput.addEventListener("change", validateFilterValue);
    fieldInput.addEventListener("change", () => { updateMatchOptions(); validateFilterValue(); });
    const table = el("table", "filter-definitions");
    const tableHead = el("thead", "");
    const headingRow = el("tr", "");
    for (const text of ["Id", "Actions", "Field", "Match", "Value"]) headingRow.append(el("th", "", text));
    tableHead.append(headingRow);
    const filterRows = el("tbody", "");
    table.append(tableHead, filterRows);
    const tableScroll = el("div", "filter-definitions-scroll");
    tableScroll.append(table);

    filterSection.append(form, tableScroll);
    const storageError = el("p", "exclusion-error filter-storage-error", "Browser storage is unavailable. Changes work on this page, but cannot be saved for later.");
    storageError.hidden = true;
    storageError.setAttribute("role", "status");
    body.append(setControls, querySection, filterSection, storageError);
    panel.append(header, body);
    container.replaceChildren(panel);
    loadSet();
    persist();

    window.addEventListener("storage", event => {
        if (temporary) return;
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        const oldId = library.selectedId;
        library = readLibrary();
        if (library.ruleSets.some(set => set.id === oldId)) library.selectedId = oldId;
        loadSet();
        onChange();
    }, {signal: events.signal});
    function persist() {
        if (temporary) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
            storageError.hidden = true;
        } catch { storageError.hidden = false; }
    }
    function validateName() {
        if (current().id == null) { nameInput.setCustomValidity(""); nameInput.removeAttribute("aria-invalid"); nameError.hidden = true; return true; }
        const name = nameInput.value.trim();
        const duplicate = library.ruleSets.some(set => set.id !== current().id && ruleSetNameKey(set.name) === ruleSetNameKey(name));
        const error = !name ? "Enter a name." : duplicate ? "A filter set with this name already exists." : "";
        nameInput.setCustomValidity(error);
        nameInput.setAttribute("aria-invalid", String(!!error));
        nameError.textContent = error;
        nameError.hidden = !error;
        return !error;
    }
    function commitName() {
        if (current().id == null) return true;
        if (!validateName()) return false;
        current().name = nameInput.value.trim();
        renderSetOptions();
        persist();
        return true;
    }
    function acceptImport(set) {
        const index = library.ruleSets.findIndex(existing => ruleSetNameKey(existing.name) === ruleSetNameKey(set.name));
        if (index >= 0) {
            set.id = library.ruleSets[index].id;
            library.ruleSets[index] = set;
        } else library.ruleSets.push(set);
        firstImportedId ??= set.id;
        persist();
        renderSetOptions();
        if (library.selectedId === set.id) { resetForm(); loadSet(); onChange(); }
    }
    function processImports() {
        while (importQueue.length > 0) {
            const set = importQueue.shift();
            if (library.ruleSets.some(existing => ruleSetNameKey(existing.name) === ruleSetNameKey(set.name))) {
                replacement = set;
                replaceText.textContent = `A filter set named “${set.name}” already exists. Replace the existing filter set?`;
                importConfirm.hidden = false;
                importButton.disabled = true;
                replaceNo.focus();
                return;
            }
            acceptImport(set);
        }
        importConfirm.hidden = true;
        importButton.disabled = false;
        if (firstImportedId && library.ruleSets.some(set => set.id === firstImportedId)) {
            library.selectedId = firstImportedId;
            resetForm();
            persist();
            loadSet();
            onChange();
        }
        firstImportedId = null;
        importButton.focus();
    }
    function showLibraryError(message) { libraryError.textContent = message; libraryError.hidden = false; }
    function renderSetOptions() {
        setSelect.replaceChildren();
        if (!library.ruleSets.length) setSelect.append(el("option", "", "Press 'New' to create your first filter set"));
        for (const set of library.ruleSets) {
            const option = el("option", "", set.name || "Untitled filter set");
            option.value = set.id;
            setSelect.append(option);
        }
        if (library.ruleSets.length) setSelect.value = library.selectedId;
    }
    function loadSet() {
        const empty = current().id == null;
        setSelect.classList.toggle("ruleset-first-use", empty);
        newButton.classList.toggle("ruleset-first-use", empty);
        for (const control of body.querySelectorAll("button, input, select, textarea")) {
            control.disabled = empty && control !== newButton && control !== importButton && control !== fileInput;
        }
        table.setAttribute("aria-disabled", String(empty));
        highlightedId = null;
        renderSetOptions();
        nameInput.value = current().name;
        nameInput.setCustomValidity("");
        nameInput.removeAttribute("aria-invalid");
        nameError.hidden = true;
        nameError.textContent = "";
        queryInput.value = current().query;
        deleteConfirm.hidden = true;
        libraryError.hidden = true;
        renderQuery();
        renderFilters();
    }
    function renderQuery() {
        const set = current();
        const compiled = compileFilterQuery(set.query, set.filters);
        queryInput.setAttribute("aria-invalid", String(!compiled.valid));
        queryError.hidden = compiled.valid;
        queryError.textContent = compiled.valid ? "" : "Invalid expression. No filters are applied.";
        queryWarning.hidden = !compiled.valid || !compiled.suspicious;
        queryWarning.textContent = queryWarning.hidden ? ""
                : "This expression contains redundant or contradictory terms. It is still applied.";
        const hasFilters = set.chain.length > 0;
        setButtonIcon(toggle, !hasFilters ? 'filters' : set.paused ? 'pause' : 'applied', {
            label: !hasFilters ? 'None' : set.paused ? 'Paused' : 'Applied',
            title: !hasFilters ? 'No filters selected' : set.paused ? 'Resume filters' : 'Pause filters'
        });
        toggle.setAttribute('aria-label', 'Apply filters');
        toggle.setAttribute("aria-checked", String(!set.paused && set.chain.length > 0));
        toggle.disabled = set.chain.length === 0;
        toggle.classList.toggle("exclusion-toggle-paused", set.paused);
        highlight.replaceChildren();
        const pattern = lexFilterQuery(set.query);
        let offset = 0;
        for (const token of pattern) {
            highlight.append(document.createTextNode(set.query.slice(offset, token.start)));
            const definition = (token.kind === "reference" || token.kind === "legacy")
                ? set.filters.find(filter => filterNameKey(filterDisplayName(filter)) === filterNameKey(token.name)) : null;
            const kind = token.text.toUpperCase();
            const span = el("span", definition ? filterColor(definition.id)
                : kind === "(" || kind === ")" ? "query-paren" : token.kind === "operator" ? "query-" + kind.toLowerCase() : "query-unknown", token.text);
            highlight.append(span);
            offset = token.end;
        }
        highlight.append(document.createTextNode(set.query.slice(offset) + "\n"));
        highlight.scrollTop = queryInput.scrollTop;
        highlight.scrollLeft = queryInput.scrollLeft;
        updateApplyButtons(compiled);
    }
    function updateApplyButtons(compiled = compileFilterQuery(current().query, current().filters)) {
        const set = current();
        const applied = set.paused ? new Set() : new Set(compiled.referencedIds);
        const definitions = new Map(set.filters.map(filter => [filter.id, filter]));
        for (const row of filterRows.children) {
            const definition = definitions.get(row.dataset.filterId);
            if (!definition) continue;
            const apply = row.querySelector(".exclusion-apply");
            const active = applied.has(definition.id);
            apply.disabled = false;
            apply.dataset.applied = String(active);
            filterActionIcon(apply, active ? "subtract" : "add", `${active ? "Unapply" : "Apply"} filter ${filterReference(definition)}`);
        }
    }
    function renderFilters() {
        if (editingId == null) {
            const nextName = nextFilterName(current().filters);
            if (!filterNameInput.value || filterNameInput.value === suggestedFilterName) filterNameInput.value = nextName;
            suggestedFilterName = nextName;
        }
        filterRows.replaceChildren();
        table.hidden = current().filters.length === 0;
        const orderedFilters = current().filters;

        for (const definition of orderedFilters) {
            const row = el("tr", "filter-definition");
            row.dataset.filterId = definition.id;
            row.classList.toggle("filter-definition-highlighted", highlightedId === definition.id);
            const idCell = el("td", "");
            const idButton = button(filterDisplayName(definition), "filter-id filter-id-button exclusion-edit " + filterColor(definition.id));
            idButton.setAttribute("aria-label", `Edit ${filterDisplayName(definition)}`);
            idButton.title = `Edit ${filterDisplayName(definition)}`;
            idButton.disabled = definition.id === editingId;
            idCell.append(idButton);
            const matchLabels = definition.field === "sqlCount" ? COUNT_MATCH_LABELS : MATCH_LABELS;
            row.append(idCell, el("td", "", FIELD_LABELS[definition.field]), el("td", "", matchLabels[definition.match]));
            const value = el("td", "filter-value", definition.value);
            value.title = definition.value;
            const actions = el("td", "filter-row-actions");
            idButton.addEventListener("click", () => {
                highlightFilter(definition.id);
                editingId = definition.id;
                updateEditButtons();
                fieldInput.value = definition.field;
                updateMatchOptions();
                matchInput.value = definition.match;
                valueInput.value = definition.value;
                filterModeLabel.textContent = "Edit";
                filterNameInput.value = filterDisplayName(definition);
                filterActionIcon(submit, "save", "Save filter");
                cancel.hidden = false;
                formError.hidden = true;
                validateFilterValue();
                valueInput.focus();
            });
            const apply = button("Apply", "exclusion-button exclusion-apply");
            filterActionIcon(apply, "add", `Apply filter ${filterReference(definition)}`);
            apply.addEventListener("click", () => {
                const set = current();
                const compiled = compileFilterQuery(set.query, set.filters);
                if (!compiled.valid) {
                    queryError.textContent = "Fix the current expression before applying a filter.";
                    queryError.hidden = false;
                    queryInput.focus();
                    return;
                }
                const appliedDefinition = set.filters.find(filter => filter.id === definition.id);
                if (!appliedDefinition) return;
                const alreadyIncluded = unconditionallyAppliedFilters(compiled).has(definition.id);
                if (!set.paused && compiled.referencedIds.includes(definition.id)) {
                    set.chain = removeFilterFromState({...set, chain: compiled.tokens}, definition.id).chain;
                    set.query = formatFilterChain(set.chain, set.filters);
                } else if (!alreadyIncluded) {
                    const reference = filterReference(appliedDefinition);
                    set.query = set.query.trim() ? `(${set.query.trim()}) OR ${reference}` : reference;
                    set.chain = compileFilterQuery(set.query, set.filters).tokens;
                }
                set.paused = false;
                queryInput.value = set.query;
                persist();
                renderQuery();
                highlightFilter(definition.id);
                onChange();
            });
            const remove = button("Remove", "exclusion-button exclusion-remove");
            filterActionIcon(remove, "remove", `Remove ${filterDisplayName(definition)}`);
            remove.addEventListener("click", () => {
                const set = current();
                const validQuery = compileFilterQuery(set.query, set.filters).valid;
                const next = removeFilterFromState(set, definition.id);
                set.filters = next.filters;
                set.chain = next.chain;
                set.query = validQuery ? formatFilterChain(next.chain, next.filters) : renameFilterReferences(set.query, filterDisplayName(definition), null);
                const compiled = compileFilterQuery(set.query, set.filters);
                set.chain = compiled.valid ? compiled.tokens : [];
                if (editingId === definition.id) resetForm();
                if (highlightedId === definition.id) highlightedId = null;
                queryInput.value = set.query;
                persist();
                renderQuery();
                renderFilters();
                onChange();
            });
            actions.append(apply, remove);
            row.insertBefore(actions, idCell.nextSibling);
            row.append(value);
            row.addEventListener("click", event => {
                if (event.target.closest("button") || window.getSelection()?.toString()) return;
                idButton.click();
            });
            filterRows.append(row);
        }
        updateApplyButtons();
    }
    function resetForm() {
        editingId = null;
        updateEditButtons();
        filterModeLabel.textContent = "Create";
        suggestedFilterName = nextFilterName(current().filters);
        filterNameInput.value = suggestedFilterName;
        filterNameInput.setCustomValidity("");
        filterNameInput.removeAttribute("aria-invalid");
        filterActionIcon(submit, "add", "Add filter");
        valueInput.value = "";
        cancel.hidden = false;
        formError.hidden = true;
        formError.textContent = "";
        valueInput.setCustomValidity("");
        valueInput.removeAttribute("aria-invalid");
        submit.disabled = false;
        updateValuePlaceholder();
    }
    function updateValuePlaceholder() {
        valueInput.placeholder = fieldInput.value === "sqlCount" ? "SQL count"
            : matchInput.value === "regex" ? "Regular expression" : "Text to match";
    }
    function updateMatchOptions() {
        const previous = matchInput.value;
        const options = fieldInput.value === "sqlCount" ? COUNT_MATCH_LABELS : MATCH_LABELS;
        matchInput.replaceChildren();
        for (const [value, label] of Object.entries(options)) {
            const option = el("option", "", label);
            option.value = value;
            matchInput.append(option);
        }
        if (Object.hasOwn(options, previous)) matchInput.value = previous;
        valueInput.type = fieldInput.value === "sqlCount" ? "number" : "text";
        if (fieldInput.value === "sqlCount") { valueInput.min = "0"; valueInput.step = "1"; }
        else { valueInput.removeAttribute("min"); valueInput.removeAttribute("step"); }
    }
    function validateFilterValue() {
        updateValuePlaceholder();
        const nameError = !validFilterName(filterNameInput.value) ? "Enter a filter name of one to thirteen characters. Full references use [name]."
            : current().filters.some(filter => filter.id !== editingId && filterNameKey(filterDisplayName(filter)) === filterNameKey(filterNameInput.value)) ? "Another filter already has this name." : null;
        filterNameInput.setCustomValidity(nameError ?? "");
        filterNameInput.setAttribute("aria-invalid", String(nameError != null));
        const error = nameError ?? (fieldInput.value === "sqlCount"
            ? valueInput.value !== "" && !validSqlCount(valueInput.value) ? "Enter a whole number of 0 or more." : null
            : matchInput.value === "regex" ? regexError(valueInput.value) : null);
        valueInput.title = matchInput.value === "regex"
                ? "JavaScript Regex, case-insensitive. Enter the pattern without / delimiters." : "";
        valueInput.setCustomValidity(error ?? "");
        valueInput.setAttribute("aria-invalid", String(error != null));
        submit.disabled = error != null;
        formError.hidden = error == null;
        formError.textContent = nameError ?? (error == null ? "" : fieldInput.value === "sqlCount" ? error : `Invalid Regex: ${error}`);
        return error == null;
    }
    function highlightFilter(id) {
        const row = [...filterRows.children].find(row => row.dataset.filterId === id);
        if (!row) return;
        highlightedId = id;
        for (const candidate of filterRows.children) candidate.classList.toggle("filter-definition-highlighted", candidate === row);
        row.scrollIntoView({block: "nearest", inline: "nearest", behavior: "smooth"});
    }
    form.addEventListener("submit", event => {
        event.preventDefault();
        if (current().id == null) return;
        const set = current();
        const value = matchInput.value === "regex" ? valueInput.value : valueInput.value.trim();
        if (!value) { formError.textContent = "Enter a value."; formError.hidden = false; return; }
        if (!validateFilterValue()) return;
        if (editingId != null && !set.filters.some(filter => filter.id === editingId)) {
            formError.textContent = "This filter no longer exists. Cancel to add a new filter.";
            formError.hidden = false;
            return;
        }
        const adding = editingId == null;
        const previous = set.filters.find(filter => filter.id === editingId);
        const filterName = filterNameInput.value.trim();
        if (previous && filterDisplayName(previous) !== filterName) set.query = renameFilterReferences(set.query, filterDisplayName(previous), filterName);
        const definition = {id: editingId ?? newFilterId(set.filters), name: filterName, field: fieldInput.value, match: matchInput.value, value};
        if (editingId != null) set.filters = set.filters.map(filter => filter.id === editingId ? definition : filter);
        else {
            set.filters.push(definition);
            set.query = set.query.trim() ? `${set.query.trim()} OR ${filterReference(definition)}` : filterReference(definition);
        }
        const compiled = compileFilterQuery(set.query, set.filters);
        set.chain = compiled.valid ? compiled.tokens : [];
        queryInput.value = set.query;
        resetForm();
        persist();
        renderQuery();
        renderFilters();
        onChange();
        valueInput.focus({preventScroll: true});
        if (adding && set.filters.length > 3) {
            tableScroll.scrollTop = tableScroll.scrollHeight;
        }
    });
    function operationSearchState(operation) {
        const set = current();
        const compiled = compileFilterQuery(set.query, set.filters);
        const matches = set.filters.filter(filter => filter.field === "operation" && filter.match === "equals"
            && filter.value.toLowerCase() === operation.toLowerCase());
        const negated = new Set();
        const pending = compiled.valid && compiled.tree ? [compiled.tree] : [];
        while (pending.length) {
            const node = pending.pop();
            if (node.type === "OR") pending.push(node.left, node.right);
            else if (node.type === "NOT" && node.child.type === "filter") negated.add(node.child.id);
        }
        const active = !set.paused ? matches.find(filter => negated.has(filter.id)) : null;
        const definition = active ?? matches[0];
        return {definition, applied: active != null, compiled,
            label: active ? requestText("Stop searching for requests with this name") : requestText("Search all requests with this name")};
    }
    return {
        dispose: () => events.abort(),
        snapshot: () => structuredClone({library, current: current()}),
        resetDemo() {
            if (!temporary) return;
            library = normalizeRuleSetLibrary(null); editingId = null; resetForm(); loadSet(); onChange();
        },
        operationSearchAction(operation) {
            const state = operationSearchState(operation);
            return {label: state.label, applied: state.applied, disabled: false};
        },
        searchOperation(operation) {
            const selected = current();
            const state = operationSearchState(operation);
            if (state.applied) {
                selected.chain = removeNegatedFilterFromChain(state.compiled.tokens, selected.filters, state.definition.id);
                selected.query = formatFilterChain(selected.chain, selected.filters);
                persist();
                loadSet();
                onChange();
                return {ok: true, message: `Stopped searching for ${globalThis.nplusoneCallRequestsTasks ? 'tasks' : 'requests'} named “${operation}”.`};
            }
            const hadQuery = selected.query.trim().length > 0;
            if (!compileFilterQuery(selected.query, selected.filters).valid) {
                return {ok: false, message: "Fix the current filter expression before adding an operation search."};
            }
            let set = selected;
            if (set.id == null) {
                set = createRuleSet(uniqueName("Operation search"));
                library.ruleSets.push(set);
                library.selectedId = set.id;
            }
            const definition = state.definition ?? {id: newFilterId(set.filters), name: nextFilterName(set.filters),
                field: "operation", match: "equals", value: operation};
            if (!state.definition) set.filters.push(definition);
            const expression = `NOT ${filterReference(definition)}`;
            if (!state.compiled.referencedIds.includes(definition.id)) {
                set.query = set.query.trim() ? `(${set.query.trim()}) OR ${expression}` : expression;
            }
            set.chain = compileFilterQuery(set.query, set.filters).tokens;
            set.paused = false;
            persist();
            loadSet();
            onChange();
            return {ok: true, message: state.definition ? `Applied filter ${filterDisplayName(definition)} for “${operation}”.`
                : `Added ${hadQuery ? "OR " : ""}${expression}: ${globalThis.nplusoneCallRequestsTasks ? 'task' : 'request'} name equals “${operation}”.`};
        },
        apply: (serverRows, unassociatedRows) => applyExclusionRules(serverRows, unassociatedRows, current()),
        limitQueries: queries => longestQueries.select(queries),
        beginTour: () => longestQueries.beginTour(),

        updateSummary() {},
        open() {
            body.hidden = false;
            disclosure.setAttribute("aria-expanded", "true");
            // A funnel can be deep down a scrolled tree, or the panel can already be open.
            // Bring the controls into view and visibly identify them on every click.
            panel.scrollIntoView({block: "start", inline: "nearest"});
            const hasCustomFilters = current().id != null && !current().paused && current().chain.length > 0;
            const nPlusOneToggle = document.getElementById("show-n-plus-one-operations");
            let highlight = header;
            if (longestQueries.isActive() && !hasCustomFilters) {
                longestQueries.focus();
                highlight = longestQueries.element;
            } else if (!hasCustomFilters && nPlusOneToggle?.getAttribute("aria-pressed") === "true") {
                nPlusOneToggle.focus({preventScroll: true});
                highlight = nPlusOneToggle;
            } else queryInput.focus({preventScroll: true});
            highlight.getAnimations().forEach(animation => animation.cancel());
            highlight.animate([{boxShadow: "0 0 0 3px var(--color-primary-border)"},
                {boxShadow: "0 0 0 0 transparent"}], {duration: 1500});
        }
    };
}

function readLibrary() {
    let stored;
    let legacy;
    let hasLibrary = false;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        hasLibrary = raw != null;
        stored = JSON.parse(raw);
    } catch {}
    if (!hasLibrary) {
        try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch {}
    }
    return normalizeRuleSetLibrary(stored, legacy);
}
function filterColor(id) { return "filter-color-" + (BigInt(id.slice(1)) % 5n); }
function el(tag, className, text) {
    const result = document.createElement(tag);
    result.className = className;
    if (text != null) result.textContent = text;
    return result;
}
function button(text, className) {
    const result = el("button", className, text);
    result.type = "button";
    return result;
}
function input(id) { const result = el("input", "exclusion-input"); result.id = id; return result; }
function select(options, id) {
    const result = el("select", "exclusion-select");
    result.id = id;
    for (const [value, label] of Object.entries(options)) {
        const option = el("option", "", label);
        option.value = value;
        result.append(option);
    }
    return result;
}
function field(label, control) {
    const wrapper = el("div", "exclusion-form-field");
    const text = el("label", "exclusion-label", label);
    text.htmlFor = control.id;
    wrapper.append(text, control);
    return wrapper;
}

function filterActionIcon(control, kind, label) {
    const paths = {subtract: "M5 12h14", add: "M12 5v14M5 12h14", save: "M4 12l5 5L20 6", cancel: "M6 6l12 12M18 6L6 18", edit: "M15 5l4 4M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15z", remove: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"};
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const path = document.createElementNS(icon.namespaceURI, "path");
    path.setAttribute("d", paths[kind]);
    icon.append(path);
    control.replaceChildren(icon);
    control.classList.add("filter-action-icon");
    control.title = label;
    control.setAttribute("aria-label", label);
}
