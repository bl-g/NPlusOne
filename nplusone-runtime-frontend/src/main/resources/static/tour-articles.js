import {TOUR_ARTICLES} from './tour-article-content.js?v=110919374025763911284457824300172119121';

export function createTourArticle(mode, onBack) {
    const copy = TOUR_ARTICLES[mode];
    const article = document.createElement('section');
    article.className = 'tour-article';
    const header = document.createElement('div');
    header.className = 'tour-article-heading';
    const heading = document.createElement('h2');
    heading.id = 'tour-article-title';
    heading.tabIndex = -1;
    heading.textContent = copy.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tour-close';
    close.textContent = '\u00d7';
    close.setAttribute('aria-label', 'Close explanation');
    close.addEventListener('click', onBack);
    header.append(heading, close);

    const content = document.createElement('div');
    content.className = 'tour-article-content';
    for (const block of copy.blocks) {
        if (block.type === 'java') {
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.className = 'language-java';
            code.setAttribute('aria-label', 'Java example');
            renderJava(code, block.text);
            pre.append(code);
            content.append(pre);
        } else if (block.type === 'image-pair') {
            content.append(createDiagramPair(block));
        } else {
            const node = document.createElement(block.type === 'heading' ? 'h3' : 'p');
            if (block.type === 'heading') node.textContent = block.text;
            // HTML is escaped and formatted from the repository's FAQ, never user input.
            else node.innerHTML = block.html;
            content.append(node);
        }
    }

    const footer = document.createElement('div');
    footer.className = 'tour-article-footer';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'reload-button tour-article-back';
    back.textContent = 'Back to tour';
    back.addEventListener('click', onBack);
    const source = document.createElement('a');
    source.href = copy.sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Read in FAQ';
    footer.append(back, source);
    article.append(header, content, footer);
    return article;
}

function createDiagramPair(block) {
    const figure = document.createElement('figure');
    figure.className = 'tour-diagram-pair';
    const controls = document.createElement('div');
    controls.className = 'tour-diagram-controls';
    const label = document.createElement('h4');
    label.textContent = block.label;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'reload-button tour-diagram-toggle';
    const execute = document.createElement('code');
    execute.textContent = '#execute*';
    toggle.append('Show which steps are captured by ', execute);
    toggle.setAttribute('aria-label', `Show which steps are captured by #execute*: ${block.label}`);
    toggle.setAttribute('aria-pressed', 'false');
    controls.append(label, toggle);

    const link = document.createElement('a');
    link.className = 'tour-diagram-frame';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Open diagram at full size';
    link.style.width = `${block.width}px`;
    link.style.aspectRatio = `${block.width} / ${block.height}`;
    const caption = document.createElement('figcaption');
    caption.className = 'tour-diagram-caption';
    const variants = [block.plain, block.measured].map((variant, index) => {
        const image = document.createElement('img');
        image.src = new URL(variant.src, import.meta.url).href;
        image.alt = variant.alt;
        image.width = variant.width;
        image.height = variant.height;
        image.decoding = 'async';
        // Keep the shared workflow stationary, including the cursor diagram's 3px inset.
        image.style.width = `${variant.width / block.width * 100}%`;
        image.style.left = `${(variant.x || 0) / block.width * 100}%`;
        image.style.top = `${(variant.y || 0) / block.height * 100}%`;
        image.hidden = index !== 0;
        const text = document.createElement('span');
        text.innerHTML = variant.caption;
        text.style.visibility = index === 0 ? 'visible' : 'hidden';
        text.setAttribute('aria-hidden', String(index !== 0));
        link.append(image);
        caption.append(text);
        return {image, text};
    });
    link.href = variants[0].image.src;
    toggle.addEventListener('click', () => {
        const measured = toggle.getAttribute('aria-pressed') !== 'true';
        toggle.setAttribute('aria-pressed', String(measured));
        variants.forEach(({image, text}, index) => {
            const active = index === Number(measured);
            image.hidden = !active;
            text.style.visibility = active ? 'visible' : 'hidden';
            text.setAttribute('aria-hidden', String(!active));
        });
        link.href = variants[Number(measured)].image.src;
    });
    figure.append(controls, link, caption);
    return figure;
}

function renderJava(target, source) {
    const tokens = /\b(public|private|protected|static|return|new|class|void|for|if|else)\b|\b(Set|String|Collectors)\b/g;
    let end = 0;
    for (const token of source.matchAll(tokens)) {
        target.append(document.createTextNode(source.slice(end, token.index)));
        const span = document.createElement('span');
        span.className = token[1] ? 'tour-java-keyword' : 'tour-java-type';
        span.textContent = token[0];
        target.append(span);
        end = token.index + token[0].length;
    }
    target.append(document.createTextNode(source.slice(end)));
}
