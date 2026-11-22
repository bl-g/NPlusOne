export function configureDateRange(from, to) {
    function update() {
        const reversed = from.value && to.value && new Date(from.value) > new Date(to.value);
        to.setCustomValidity(reversed ? 'To must not be earlier than From.' : '');
    }
    for (const input of [from, to]) {
        input.addEventListener('input', update);
        input.addEventListener('change', update);
    }
    return () => {
        update();
        return from.reportValidity() && to.reportValidity();
    };
}
