const isTrueFlatTopValue = (value: unknown) =>
  value === true ||
  (typeof value === 'string' &&
    ['true', 'yes', 'flat top', 'flattop'].includes(
      value.trim().toLowerCase()
    ));

export function isP1FlatTopOrder(order: unknown): boolean {
  if (!order || typeof order !== 'object') return false;

  const candidate = order as Record<string, any>;
  const features =
    candidate.features && typeof candidate.features === 'object'
      ? candidate.features
      : {};
  const specifications =
    candidate.specifications && typeof candidate.specifications === 'object'
      ? candidate.specifications
      : features.specifications && typeof features.specifications === 'object'
        ? features.specifications
        : {};
  const nestedFeatures =
    specifications.features && typeof specifications.features === 'object'
      ? specifications.features
      : {};

  return [
    candidate.isFlattop,
    candidate.isFlatTop,
    candidate.is_flattop,
    candidate.flatTop,
    candidate.flat_top,
    features.isFlattop,
    features.isFlatTop,
    features.is_flattop,
    features.flatTop,
    features.flat_top,
    features.flattop,
    specifications.isFlattop,
    specifications.isFlatTop,
    specifications.is_flattop,
    specifications.flatTop,
    specifications.flat_top,
    specifications.flattop,
    nestedFeatures.isFlattop,
    nestedFeatures.isFlatTop,
    nestedFeatures.is_flattop,
    nestedFeatures.flatTop,
    nestedFeatures.flat_top,
    nestedFeatures.flattop,
  ].some(isTrueFlatTopValue);
}
