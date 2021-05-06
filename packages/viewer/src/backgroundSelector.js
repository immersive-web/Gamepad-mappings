const defaultBackground = 'georgentor';

export default class BackgroundSelector extends EventTarget {
  constructor() {
    super();

    this.backgroundSelectorElement = document.getElementById('backgroundSelector');
    this.backgroundSelectorElement.addEventListener('change', () => { this.onBackgroundChange(); });

    this.selectedBackground = window.localStorage.getItem('background') || defaultBackground;
    this.backgroundList = {};
    fetch('backgrounds/backgrounds.json')
      .then(response => response.json())
      .then((backgrounds) => {
        this.backgroundList = backgrounds;
        Object.keys(backgrounds).forEach((background) => {
          const option = document.createElement('option');
          option.value = background;
          option.innerText = background;
          if (this.selectedBackground === background) {
            option.selected = true;
          }
          this.backgroundSelectorElement.appendChild(option);
        });
        this.dispatchEvent(new Event('selectionchange'));
      });
  }

  onBackgroundChange() {
    this.selectedBackground = this.backgroundSelectorElement.value;
    window.localStorage.setItem('background', this.selectedBackground);
    this.dispatchEvent(new Event('selectionchange'));
  }

  get backgroundPath() {
    return this.backgroundList[this.selectedBackground];
  }
}
