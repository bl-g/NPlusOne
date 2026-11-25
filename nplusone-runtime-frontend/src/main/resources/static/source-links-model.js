export function normalizeSourceSettings(value) {
    const project = String(value?.project ?? "").trim();
    const mappings = (value?.mappings ?? []).map(mapping => ({
        prefix: String(mapping.prefix ?? "").trim(),
        root: String(mapping.root ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")
    }));
    if (!project) throw new Error("Enter the project name shown in IntelliJ.");
    if (!mappings.length) throw new Error("Add at least one source-folder mapping.");
    const prefixes = new Set();
    for (const {prefix, root} of mappings) {
        if (prefix && !/^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u.test(prefix)) {
            throw new Error("Enter a package or class prefix, such as com.example.");
        }
        if (!root || /^(?:\/|[a-z]+:)/i.test(root) || root.split("/").some(part => !part || part === "." || part === "..")) {
            throw new Error("Source folders must be relative to the project, such as module/src/main/java.");
        }
        if (prefixes.has(prefix)) throw new Error("Use distinct package or class prefixes to distinguish source folders.");
        prefixes.add(prefix);
    }
    return {project, mappings};
}

export function sourceLocation(frame) {
    const match = String(frame ?? "").trim().replace(/^at\s+/, "").match(/^([^()]+)\(([^/\\:()]+):(\d+)\)$/);
    if (!match || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) < 1) return null;
    const method = match[1].lastIndexOf(".");
    if (method < 0) return null;
    const owner = match[1].slice(0, method).replace(/\/0x[\da-f]+$/i, "");
    const className = owner.slice(owner.lastIndexOf("/") + 1);
    if (!/^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u.test(className)
            || !/^[^/\\:()]+\.[a-z0-9]+$/i.test(match[2]) || match[2] === "..") return null;
    const packageEnd = className.lastIndexOf(".");
    return {className, packagePath: packageEnd < 0 ? "" : className.slice(0, packageEnd).replaceAll(".", "/"),
        file: match[2], line: Number(match[3])};
}

export function sourceUrl(frame, settings) {
    const location = sourceLocation(frame);
    if (!location || !settings) return null;
    const mapping = settings.mappings.filter(({prefix}) => !prefix || location.className === prefix
        || location.className.startsWith(prefix + ".") || location.className.startsWith(prefix + "$"))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    if (!mapping) return null;
    const path = [mapping.root, location.packagePath, location.file].filter(Boolean).join("/");
    // Toolbox navigation passes these coordinates directly to IntelliJ's
    // zero-based LogicalPosition; captured JVM line numbers are one-based.
    return "jetbrains://idea/navigate/reference?project=" + encodeURIComponent(settings.project)
        + "&path=" + encodeURIComponent(`${path}:${location.line - 1}:0`);
}

export function importToolboxUrl(text) {
    let url;
    try { url = new URL(text.trim()); } catch { throw new Error("Paste a Toolbox URL copied from IntelliJ."); }
    if (url.protocol !== "jetbrains:" || url.hostname !== "idea" || url.pathname !== "/navigate/reference"
            || !url.searchParams.get("project") || !(url.searchParams.get("path") || url.searchParams.get("fqn"))) {
        throw new Error("Use Copy Path/Reference → Toolbox URL on an IntelliJ source file.");
    }
    const path = (url.searchParams.get("path") ?? "").replace(/:\d+(?::\d+)?$/, "").replace(/\\/g, "/");
    const sourceRoot = path.match(/^(.*?\bsrc\/(?:main|test)\/(?:java|kotlin|groovy|scala))\/(.*)$/);
    const suffix = sourceRoot?.[2] ?? "";
    if (!sourceRoot && url.searchParams.get("fqn")) {
        const className = url.searchParams.get("fqn").split("#")[0].replace(/:\d+(?::\d+)?$/, "");
        if (!/^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u.test(className)) {
            throw new Error("The Toolbox URL does not contain a valid class reference.");
        }
        return {project: url.searchParams.get("project"), mapping: {
            prefix: className.includes(".") ? className.slice(0, className.lastIndexOf(".")) : "", root: ""
        }};
    }
    return {project: url.searchParams.get("project"), mapping: sourceRoot ? {
        root: sourceRoot[1], prefix: suffix.includes("/") ? suffix.slice(0, suffix.lastIndexOf("/")).replaceAll("/", ".") : ""
    } : null};
}
