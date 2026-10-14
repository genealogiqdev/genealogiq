interface PlaceQrTarget {
  id: string
  userId: string
  categories: readonly string[]
}

export function isMemorialPlace(place: Pick<PlaceQrTarget, "categories">): boolean {
  return place.categories.some((category) => category === "resting_place" || category === "memorial_site")
}

// A plaque at a resting place introduces the person, not the location editor.
// Other life-place codes still open their specific location.
export function getPlaceQrPath(place: PlaceQrTarget): string {
  const profilePath = `/profile/${place.userId}`
  return isMemorialPlace(place) ? profilePath : `${profilePath}/places/${place.id}`
}
