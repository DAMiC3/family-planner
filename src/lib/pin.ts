/** The Map-tab pin shape (24×32 viewBox), used for every pin on every map. */
export const PIN_PATH =
  "M12 0C5.37 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.63 0 12 0Zm0 6.8a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z";

/** HTML for a Leaflet divIcon: the pin in `color` (white = no car), with a soft shadow. */
export function pinHtml(color: string) {
  return `<div style="width:30px;height:40px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"><svg width="30" height="40" viewBox="0 0 24 32" aria-hidden="true"><path fill-rule="evenodd" fill="${color}" d="${PIN_PATH}"/></svg></div>`;
}

export const PIN_ICON_OPTIONS = { className: "", iconSize: [30, 40] as [number, number], iconAnchor: [15, 40] as [number, number], popupAnchor: [0, -36] as [number, number] };
