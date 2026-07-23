const isTrueFlatTopValue = (value: unknown) =>
  value === true ||
  (typeof value === 'string' &&
    ['true', 'yes', 'flat top', 'flattop'].includes(value.trim().toLowerCase()));

export function isP1FlatTop(specifications: unknown): boolean {
  const specs =
    specifications && typeof specifications === 'object'
      ? (specifications as Record<string, any>)
      : {};
  const features =
    specs.features && typeof specs.features === 'object'
      ? (specs.features as Record<string, any>)
      : {};

  return [
    specs.isFlattop,
    specs.isFlatTop,
    specs.flatTop,
    specs.flat_top,
    specs.flattop,
    features.isFlattop,
    features.isFlatTop,
    features.flatTop,
    features.flat_top,
    features.flattop,
  ].some(isTrueFlatTopValue);
}

export function normalizeP1FlatTopSpecifications(specifications: unknown) {
  const specs =
    specifications && typeof specifications === 'object'
      ? (specifications as Record<string, any>)
      : {};
  const features =
    specs.features && typeof specs.features === 'object'
      ? (specs.features as Record<string, any>)
      : {};
  const flatTop = isP1FlatTop(specs);

  return {
    ...specs,
    isFlattop: flatTop,
    flatTop,
    flat_top: flatTop,
    features: {
      ...features,
      isFlattop: flatTop,
      flatTop,
      flat_top: flatTop,
      flattop: flatTop,
    },
  };
}
