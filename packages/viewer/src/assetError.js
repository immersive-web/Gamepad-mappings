let errorsSectionElement;
let errorsListElement;
class AssetError extends Error {
  constructor(...params) {
    super(...params);
    AssetError.log(this.message);
  }

  static initialize() {
    errorsListElement = document.getElementById('errors');
    errorsSectionElement = document.getElementById('errors');
  }

  static log(errorMessage) {
    const itemElement = document.createElement('li');
    itemElement.innerText = errorMessage;
    errorsListElement.appendChild(itemElement);
    errorsSectionElement.hidden = false;
  }

  static clearAll() {
    errorsListElement.innerHTML = '';
    errorsSectionElement.hidden = true;
  }
}

export default AssetError;
