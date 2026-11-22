import {requestText} from "./request-terminology.js?v=9195521797058750261190268690836445467";
export function createOperationActions({onSearch, onViewFilters, getSearchAction, getGroupActions = () => []}) {
    const menu = document.createElement("div");
    menu.className = "chart-popup operation-menu";
    menu.hidden = true;
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", requestText("Request actions"));
    menu.tabIndex = -1;
    const search = button(requestText("Search all requests with this name"), () => {
        const name = operation;
        close();
        searchOperation(name);
    });
    const groupActions = document.createElement("div");
    groupActions.className = "operation-menu-group-actions";
    menu.append(search, groupActions);
    document.body.append(menu);
    let anchor = null, operation = "", timer;
    const toast = document.createElement("div");
    toast.className = "operation-toast";
    toast.hidden = true;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const message = document.createElement("span");
    const view = button("View filters", () => { toast.hidden = true; onViewFilters(); });
    const dismiss = button("×", () => { toast.hidden = true; clearTimeout(timer); });
    dismiss.setAttribute("aria-label", "Dismiss notification");
    toast.append(message, view, dismiss);
    document.body.append(toast);
    const scheduleDismiss = () => { clearTimeout(timer); timer = setTimeout(() => { toast.hidden = true; }, 6000); };
    toast.addEventListener("pointerenter", () => clearTimeout(timer));
    toast.addEventListener("pointerleave", scheduleDismiss);
    toast.addEventListener("focusin", () => clearTimeout(timer));
    toast.addEventListener("focusout", scheduleDismiss);
    function searchOperation(name) {
        if (!name) return;
        const result = onSearch(name);
        message.textContent = result.message;
        toast.hidden = false;
        scheduleDismiss();
    }
    function close(restoreFocus = false) {
        menu.hidden = true;
        anchor?.setAttribute("aria-expanded", "false");
        if (restoreFocus) anchor?.focus({preventScroll: true});
        anchor = null;
    }
    document.addEventListener("pointerdown", event => {
        if (!menu.hidden && !menu.contains(event.target) && !anchor?.contains(event.target)) close();
    });
    document.addEventListener("keydown", event => {
        if (menu.hidden) return;
        if (event.key === "Escape") { event.preventDefault(); close(true); }
        if (event.key === "Tab") {
            const buttons = [...menu.querySelectorAll("button")].filter(button => !button.disabled && !button.hidden);
            if (!buttons.length) { close(true); return; }
            event.preventDefault();
            const index = buttons.indexOf(document.activeElement);
            buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
        }
    });
    window.addEventListener("resize", () => close());
    window.addEventListener("scroll", event => { if (!menu.contains(event.target)) close(); }, true);
    return {
        getSearchAction,
        search: searchOperation,
        open(target, name) {
            if (!name) return;
            if (anchor === target && !menu.hidden) { close(); return; }
            close();
            anchor = target;
            operation = name;
            groupActions.replaceChildren(...getGroupActions(target).map(action=>button(action.label,()=>{
                close(); action.apply();
            })));
            const state = getSearchAction(name);
            search.textContent = state.label;
            search.disabled = state.disabled;
            anchor.setAttribute("aria-expanded", "true");
            menu.hidden = false;
            const rect = target.getBoundingClientRect();
            menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
            menu.style.top = `${Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - menu.offsetHeight - 8))}px`;
            (search.disabled ? menu : search).focus({preventScroll: true});
        }
    };
}

function button(text, onClick) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "filter-button";
    node.textContent = text;
    node.addEventListener("click", onClick);
    return node;
}
