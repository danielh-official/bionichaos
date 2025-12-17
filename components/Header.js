class Header extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <header>
                <div>Code provided by: <a href="${this.link}" target="_blank">${this.link}</a></div>
                <div style="margin-top: 0.5rem;">Return <a href="../pages.html">Home</a></div>
            </header>
        `;
    }

    static get observedAttributes() {
        return ['link'];
    }

    attributeChangedCallback(property, oldValue, newValue) {
        if (oldValue === newValue) return;
        this[ property ] = newValue;
    }
}
customElements.define('custom-header', Header);