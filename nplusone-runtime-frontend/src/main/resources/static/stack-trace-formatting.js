export function formatStackTrace(stackTrace) {
    const frames = stackTrace
            .split(/\r?\n/)
            .filter(frame => frame.trim().length > 0);

    if (frames.length < 4) {
        return {
            summary: stackTrace,
            full: stackTrace
        };
    }

    const hiddenFrameCount = frames.length - 2;
    return {
        summary: `${frames[0]}\n... ${hiddenFrameCount} more frames ...\n${frames.at(-1)}`,
        full: stackTrace
    };
}

// Keep the cached text and cell identity intact. Only the mounted table's
// presentation abbreviates frame names; filters still see the captured trace.
export function renderStackTrace(element, stackTrace) {
    const fragment = document.createDocumentFragment();
    const lines = String(stackTrace ?? "").split(/\r?\n/);
    const firstFrame = lines.findIndex(line => /\S/.test(line));
    lines.forEach((line, index) => {
        if (index > 0) fragment.append("\n");
        const displayLine = line.replace(/^(\s*)at\s+/, "$1");
        const frame = displayLine.match(/^(\s*)([^\s()]+)\(([^()]*)\)(\s*)$/);
        const methodSeparator = frame?.[2].lastIndexOf(".") ?? -1;
        if (methodSeparator <= 0) {
            fragment.append(displayLine);
            return;
        }
        const owner = frame[2].slice(0, methodSeparator);
        // Hidden JVM classes include a /0x... suffix; that slash is part of
        // the class identity, unlike a loader/module prefix before the class.
        const qualifiedClass = owner.replace(/\/0x[\da-f]+$/i, "");
        const classStart = Math.max(qualifiedClass.lastIndexOf("."), qualifiedClass.lastIndexOf("/")) + 1;
        const span = document.createElement("span");
        span.className = index === firstFrame ? "stack-frame stack-frame-root" : "stack-frame";
        span.textContent = frame[1] + owner.slice(classStart) + frame[2].slice(methodSeparator)
            + `(${frame[3]})` + frame[4];
        span.title = `${frame[2]}(${frame[3]})`;
        fragment.append(span);
    });
    element.replaceChildren(fragment);
}
