import {readStoredJson, writeStoredJson, removeStoredValue} from "./browser-storage.js?v=290084059958384501112687013092675042027";
import {normalizeSourceSettings, sourceLocation, sourceUrl, importToolboxUrl} from "./source-links-model.js?v=8625427331796203125";
import {setButtonIcon} from "./toolbar-icons.js?v=17145807429823737765";

const STORAGE_KEY = "nplusone.source-links.v1";
let settings = readSettings();
let revision = 0;
function readSettings() {
    try {
        const value = readStoredJson(localStorage, STORAGE_KEY);
        return value == null ? null : normalizeSourceSettings(value);
    } catch { return null; }
}
export function sourceLinksVersion() { return revision; }

export function createSourceLink(frame, text, className) {
    const link = document.createElement("a");
    link.className = `source-link ${className}`;
    link.textContent = text;
    link.dataset.sourceFrame = frame;
    updateLink(link);
    link.addEventListener("click", event => event.stopPropagation());
    link.addEventListener("keydown", event => event.stopPropagation());
    return link;
}
function updateLink(link) {
    const url = sourceUrl(link.dataset.sourceFrame, settings);
    if (url) {
        link.href = url;
        const location = sourceLocation(link.dataset.sourceFrame);
        link.title = `Open ${location.file}:${location.line} in IntelliJ (${settings.project})`;
    } else {
        link.removeAttribute("href");
        link.removeAttribute("title");
    }
}

export function installSourceLinks({onChange}) {
    if (document.getElementById("configure-source-links")) return;
    const host = document.querySelector(".tour-header-actions") ?? document.querySelector("main > header");
    if (!host) return;
    const button = document.createElement("button");
    button.id = "configure-source-links";
    button.type = "button";
    button.className = "reload-button source-settings-button";
    setButtonIcon(button, "link", {label: "Source code", showLabel: true});
    button.setAttribute("aria-haspopup", "dialog");
    button.addEventListener("click", () => openSettings(button, changed));
    host.insertBefore(button, host.querySelector(".tour-help"));
    function changed() {
        revision++;
        document.querySelectorAll(".source-link").forEach(updateLink);
        onChange();
    }
    window.addEventListener("storage", event => {
        if (event.key === STORAGE_KEY || event.key == null) { settings = readSettings(); changed(); }
    });
}

function openSettings(trigger, changed) {
    const dialog = document.createElement("dialog");
    dialog.className = "source-settings-dialog";
    dialog.setAttribute("aria-labelledby", "source-settings-heading");
    // Static markup only; user-entered values are assigned through input.value.
    dialog.innerHTML = `
        <form id="source-settings-form">
            <h2 id="source-settings-heading">Open source in IntelliJ</h2>
            <p>Click a linked filename to open its captured line in IntelliJ. Keep JetBrains Toolbox running.</p>
            <label>Paste a Toolbox URL (optional)<input id="source-toolbox-url" type="text" placeholder="jetbrains://idea/navigate/reference?…"></label>
            <button type="button" class="reload-button" id="import-source-url">Use URL</button>
            <p class="source-settings-hint">In IntelliJ, right-click a source file and choose Copy Path/Reference → Toolbox URL.</p>
            <label>IntelliJ project name<input id="source-project" type="text" required placeholder="my-application"></label>
            <h3>Source folders</h3>
            <p class="source-settings-hint">Use paths relative to the IntelliJ project. The most specific package or class prefix wins. Leave the prefix blank for a default folder.</p>
            <div id="source-mappings"></div>
            <button type="button" class="reload-button" id="add-source-mapping">Add source folder</button>
            <p id="source-settings-error" class="source-settings-error" role="alert" hidden></p>
            <p id="source-settings-notice" class="source-settings-hint" role="status"></p>
            <p class="source-settings-hint">Saved only in this browser. Source code is not uploaded. This opens your local checkout; use a matching version for accurate line numbers.</p>
            <div class="source-settings-actions">
                <button type="button" class="reload-button" id="disable-source-links">Disable links</button>
                <button type="button" class="reload-button" id="cancel-source-settings">Cancel</button>
                <button type="submit" class="reload-button source-settings-save">Save</button>
            </div>
        </form>`;
    const project = dialog.querySelector("#source-project");
    const mappings = dialog.querySelector("#source-mappings");
    const error = dialog.querySelector("#source-settings-error");
    const notice = dialog.querySelector("#source-settings-notice");
    project.value = settings?.project ?? "";
    function addMapping(mapping = {prefix: "", root: "src/main/java"}) {
        const row = document.createElement("div");
        row.className = "source-mapping";
        row.innerHTML = `<label>Package or class prefix<input class="source-prefix" type="text" placeholder="com.example"></label>
            <label>Source folder<input class="source-root" type="text" required placeholder="module/src/main/java"></label>
            <button type="button" class="reload-button" aria-label="Remove source folder">Remove</button>`;
        row.querySelector(".source-prefix").value = mapping.prefix;
        row.querySelector(".source-root").value = mapping.root;
        row.querySelector("button").addEventListener("click", () => {
            const next = row.nextElementSibling ?? row.previousElementSibling;
            row.remove();
            (next?.querySelector("input") ?? dialog.querySelector("#add-source-mapping")).focus();
        });
        mappings.append(row);
        return row;
    }
    (settings?.mappings ?? [{prefix: "", root: "src/main/java"}]).forEach(addMapping);
    dialog.querySelector("#add-source-mapping").addEventListener("click", () => addMapping().querySelector("input").focus());
    dialog.querySelector("#import-source-url").addEventListener("click", () => {
        try {
            const imported = importToolboxUrl(dialog.querySelector("#source-toolbox-url").value);
            project.value = imported.project;
            if (imported.mapping) {
                const existing = [...mappings.children].find(row => row.querySelector(".source-prefix").value === imported.mapping.prefix);
                if (existing) {
                    if (imported.mapping.root) existing.querySelector(".source-root").value = imported.mapping.root;
                }
                else if (!settings && mappings.children.length === 1 && !mappings.querySelector(".source-prefix").value) {
                    mappings.replaceChildren(); addMapping(imported.mapping);
                } else addMapping(imported.mapping);
            }
            error.hidden = true;
            notice.textContent = imported.mapping?.root ? "Project and source folder filled in. Check the prefix before saving."
                : imported.mapping ? "Project and package filled in. Check the source folder below; class-reference URLs do not contain its location."
                : "Project filled in. Enter the source folder below; this URL does not contain a conventional src/main or src/test path.";
        } catch (failure) { showError(failure.message); }
    });
    function showError(message) { error.textContent = message; error.hidden = false; }
    let cleaned = false;
    const cleanup = () => { if (!cleaned) { cleaned = true; dialog.remove(); trigger.focus(); } };
    const close = () => { dialog.close(); cleanup(); };
    dialog.querySelector("#cancel-source-settings").addEventListener("click", close);
    dialog.querySelector("#disable-source-links").addEventListener("click", () => {
        settings = null;
        removeStoredValue(localStorage, STORAGE_KEY);
        changed(); close();
    });
    dialog.querySelector("form").addEventListener("submit", event => {
        event.preventDefault();
        try {
            const next = normalizeSourceSettings({project: project.value, mappings: [...mappings.children].map(row => ({
                prefix: row.querySelector(".source-prefix").value, root: row.querySelector(".source-root").value
            }))});
            settings = next;
            writeStoredJson(localStorage, STORAGE_KEY, settings);
            changed(); close();
        } catch (failure) { showError(failure.message); }
    });
    dialog.addEventListener("close", cleanup, {once: true});
    document.body.append(dialog);
    dialog.showModal();
}
