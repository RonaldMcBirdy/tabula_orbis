import { Marker, Polygon, Popup } from "react-leaflet";
import { provinceCenter } from "../../utils/geo.js";
import { leafletLabelIcon } from "../../utils/icons.js";

function ProvincePopup({ province, onDeleteProvince }) {
  return (
    <Popup maxWidth={360}>
      <div className="popup-card province-popup">
        <h3>{province.name}</h3>
        {province.description ? <p>{province.description}</p> : <p>No description added.</p>}
        {onDeleteProvince ? (
          <button type="button" className="popup-delete-btn" onClick={() => onDeleteProvince(province.id)}>
            Delete province
          </button>
        ) : null}
      </div>
    </Popup>
  );
}

export default function CustomProvincesLayer({
  provinces,
  selectedProvinceId,
  showLabels,
  onSelectProvince,
  onDeleteProvince,
}) {
  return (
    <>
      {provinces.map((province) => {
        const isSelected = selectedProvinceId === province.id;
        const color = isSelected ? "#f3c15f" : "#7f3f20";

        return (
          <Polygon
            key={`${province.id}-area`}
            positions={province.coordinates}
            eventHandlers={{
              click: () => onSelectProvince(province.id),
            }}
            pathOptions={{
              color,
              weight: isSelected ? 5 : 2,
              opacity: isSelected ? 1 : 0.82,
              fillColor: color,
              fillOpacity: isSelected ? 0.38 : 0.12,
            }}
          >
            <ProvincePopup province={province} onDeleteProvince={onDeleteProvince} />
          </Polygon>
        );
      })}
      {showLabels
        ? provinces.map((province) => {
            const isSelected = selectedProvinceId === province.id;
            return (
              <Marker
                key={`${province.id}-label`}
                position={provinceCenter(province.coordinates)}
                icon={leafletLabelIcon(province.name, isSelected)}
                eventHandlers={{
                  click: () => onSelectProvince(province.id),
                }}
                zIndexOffset={isSelected ? 1000 : 500}
              >
                <ProvincePopup province={province} onDeleteProvince={onDeleteProvince} />
              </Marker>
            );
          })
        : null}
    </>
  );
}
