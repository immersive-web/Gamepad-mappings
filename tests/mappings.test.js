const testHelpers = require("./testHelpers.js");
const validator = testHelpers.getValidator();

const mappingDescriptions = require("../src/mappingDescriptions.js");
const mappingList = mappingDescriptions.getList();

describe.each(mappingList)("validateMapping.%s", (gamepadId) => {
  const mapping = mappingDescriptions.getMappingById(gamepadId);

  test("Mapping exists and passes schema validation", () => {
    expect(mapping).not.toBeNull();
    let valid = validator(mapping);
    if (!valid) {
      expect(validator.errors).toBeNull();
    }
  });

  test("Mapping has unique data source ids", () => {
    let dataSourceIds = {};
    mapping.dataSources.forEach((dataSource) => {
      expect(dataSourceIds[dataSource.id]).toBeUndefined();
      dataSourceIds[dataSource.id] = true;
    });
  });

  test("Each hand has unique dataSources", () => {
    Object.values(mapping.hands).forEach((hand) => {
      let dataSourceIndices = {};
      hand.components.forEach((componentIndex) => {
        let component = mapping.components[componentIndex];
        expect(dataSourceIndices[component.dataSource]).toBeUndefined();
        dataSourceIndices[component.dataSource] = true;
      });
    });
  });

  test("Component references are valid", () => {
    mapping.components.forEach((component) => {
      expect(component.dataSource).toBeLessThan(mapping.dataSources.length);
      component.visualResponses.forEach((visualResponse) => {
        expect(visualResponse).toBeLessThan(mapping.visualResponses.length);
      });
    });
  });

  test("Hand references are valid", () => {
    Object.values(mapping.hands).forEach((hand) => {
      hand.components.forEach((component) => {
        expect(component).toBeLessThan(mapping.components.length);
      });

      if (hand.primaryButtonComponent) {
        expect(hand.primaryButtonComponent).toBeLessThan(mapping.components.length);
        let component = mapping.components[hand.primaryButtonComponent];
        let dataSource = mapping.dataSources[component.dataSource];
        expect(dataSource.dataSourceType).toBe("buttonSource");
      }
      
      if (hand.primaryAxesComponent) {
        expect(hand.primaryAxesComponent).toBeLessThan(mapping.components.length);
        let component = mapping.components[hand.primaryAxesComponent];
        let dataSource = mapping.dataSources[component.dataSource];
        expect(dataSource.dataSourceType).toMatch(/thumbstickSource|touchpadSource/);
      }
    })
  });

  test("No unused data sources", () => {
    let usedDataSourceIndices = Array(mapping.dataSources.length);
    mapping.components.forEach((component) => {
      usedDataSourceIndices[component.dataSource] = true;
    });

    let unusedDataSources = mapping.dataSources.filter((dataSource, index) => !usedDataSourceIndices[index]);
    expect(unusedDataSources).toHaveLength(0);
  });

  test("No unused components", () => {
    let usedComponentIndices = Array(mapping.components.length);

    Object.values(mapping.hands).forEach((hand) => {
      hand.components.forEach((componentIndex) => {
        usedComponentIndices[componentIndex] = true;
      });
    });

    let unusedComponents = mapping.components.filter((component, index) => !usedComponentIndices[index]);
    expect(unusedComponents).toHaveLength(0);
  });

});