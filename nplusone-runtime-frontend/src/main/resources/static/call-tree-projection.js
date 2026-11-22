// Project a captured call tree into visible rows without modifying its model.
// A level is a branching stage, not a stack frame: unary equal-count method
// chains can be followed to their next meaningful endpoint in one stage.
// isExpanded may return true (one stage) or a positive integer minimum budget.
export function projectCallTree(root, {levels = 1, revealAll = false,
    isCollapsed = () => false, isExpanded = () => false,
    isChainExpanded = () => false, isChainHidden = () => false} = {}) {
    const budget = levels === Infinity ? Infinity
        : Number.isFinite(Number(levels)) ? Math.max(0, Math.floor(Number(levels))) : 1;
    const result = [];
    const pending = [];
    const collapsed = new Map();
    const expanded = new Map();
    function closed(node) {
        if (!collapsed.has(node)) collapsed.set(node, Boolean(isCollapsed(node)));
        return collapsed.get(node);
    }
    function opened(node) {
        if (!expanded.has(node)) {
            const value = isExpanded(node);
            expanded.set(node, value === true ? 1 : typeof value === "number" && Number.isFinite(value)
                ? Math.max(0, Math.floor(value)) : 0);
        }
        return expanded.get(node);
    }
    function emit(node, parent, depth, frontier = false) {
        const descriptor = {kind: "node", node, parent, depth,
            collapsed: node.kind === "frame" && closed(node), frontier};
        result.push(descriptor);
        return descriptor;
    }
    function enqueue(children, parent, depth, remaining) {
        for (let index = children.length - 1; index >= 0; index--) {
            pending.push({node: children[index], parent, depth, remaining});
        }
    }
    enqueue(root.children, null, 0, budget);
    while (pending.length > 0) {
        const {node, parent, depth, remaining} = pending.pop();
        if (node.kind !== "frame") {
            emit(node, parent, depth);
            continue;
        }
        if (closed(node)) {
            emit(node, parent, depth);
            continue;
        }
        const available = revealAll ? Infinity : Math.max(remaining, opened(node));
        if (available <= 0 && node.children.some(child => child.kind === "frame")) {
            const descriptor = emit(node, parent, depth, true);
            // A frontier hides deeper call paths, not SQL directly attached to
            // this visible method. A local explicit collapse still hides both.
            enqueue(node.children.filter(child => child.kind !== "frame"), descriptor, depth + 1, 0);
            continue;
        }

        const chain = [node];
        let end = node;
        let hiddenPrefix = false;
        let chainBudget = available;
        while (!closed(end) && end.children.length === 1) {
            const child = end.children[0];
            if (child.kind !== "frame" || child.issueCount !== end.issueCount) break;
            if (chain.length > 1 && isChainHidden(end)) hiddenPrefix = true;
            chain.push(child);
            end = child;
            chainBudget = Math.max(chainBudget, opened(end));
            // A manually opened method must remain a visible control when a
            // previously closed chain is projected again.
            if (opened(end) > 0 && !isChainHidden(end)
                    && (hiddenPrefix || !revealAll && !isChainExpanded(end))) break;
        }
        let descriptor = emit(node, parent, depth);
        const hidden = chain.length >= 3 ? chain.slice(1, -1) : [];
        // A live update may merge a previously revealed segment into a longer
        // chain. Preserve that reveal even when its first hidden node changes.
        if (hidden.length > 0) {
            const expanded = !hidden.some(isChainHidden) && (revealAll || hidden.some(isChainExpanded));
            const gap = {kind: "gap", node: chain[1], hidden, end,
                parent: descriptor, depth: depth + 1, expanded};
            result.push(gap);
            descriptor = gap;
            if (expanded) {
                for (let index = 1; index < chain.length; index++) {
                    descriptor = emit(chain[index], descriptor, depth + index + 1);
                }
            } else descriptor = emit(end, gap, depth + 2);
        } else {
            // Emit the entire revealed chain here so a later node cannot
            // recompress its suffix during the same projection.
            for (let index = 1; index < chain.length; index++) {
                descriptor = emit(chain[index], descriptor, depth + index);
            }
        }
        if (descriptor.collapsed) continue;
        const endpointBudget = revealAll ? Infinity : chainBudget;
        const nextBudget = endpointBudget - (end.children.length > 1 ? 1 : 0);
        enqueue(end.children, descriptor, descriptor.depth + 1, nextBudget);
    }
    return result;
}
