class HeadAttributes extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${this.title}</title>
            <meta name="description"
                content="${this.description}">
            <meta name="keywords"
                content="${this.keywords}">
            <meta property="og:title" content="${this.title}">
            <meta property="og:description"
                content="${this.description}">
            <meta property="og:image" content="${this.image}">
            <meta property="og:url" content="${this.url}">
            <meta property="og:type" content="website">
            <meta name="author" content="BioniChaos">
            <meta name="publish_date" content="2025-10-10">
        `;
    }

    static get observedAttributes() {
        return ['title', 'description', 'keywords', 'image', 'url'];
    }

    attributeChangedCallback(property, oldValue, newValue) {
        if (oldValue === newValue) return;
        this[property] = newValue;
    }
}
customElements.define('custom-head-attributes', HeadAttributes);