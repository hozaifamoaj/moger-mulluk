import { DISPLAY, ROAD } from './config';

// §7.1 Road geometry, left to right: footpath, player carriageway, divider,
// opposite carriageway, footpath — centered in the playfield. Shared by the
// sim (kerb/divider contact) and the presentation layer (drawing the road),
// so both always agree on where the road actually is.
export interface RoadEdges {
  roadLeftX: number;
  footpathPlayerRightX: number; // = kerbLeftX: left edge of the player carriageway
  dividerLeftX: number; // right edge of the player carriageway
  dividerRightX: number;
  footpathOppositeLeftX: number;
  roadRightX: number;
}

// `playerLanes` defaults to ROAD.playerLanes (the M2/M3 straight-road
// prototype); M4 map segments pass their own lane count (2 or 3, for the
// 3-to-2-lane merge in §7.2) so both sim and presentation agree on the
// narrowed cross-section.
export function computeRoadEdges(playerLanes: number = ROAD.playerLanes): RoadEdges {
  const playerCarriagewayWidth = ROAD.laneWidth * playerLanes;
  const oppositeCarriagewayWidth = ROAD.laneWidth * ROAD.oppositeLanes;
  const roadWidth =
    ROAD.footpathWidth * 2 + playerCarriagewayWidth + ROAD.dividerWidth + oppositeCarriagewayWidth;

  const roadLeftX = (DISPLAY.width - roadWidth) / 2;
  const footpathPlayerRightX = roadLeftX + ROAD.footpathWidth;
  const dividerLeftX = footpathPlayerRightX + playerCarriagewayWidth;
  const dividerRightX = dividerLeftX + ROAD.dividerWidth;
  const footpathOppositeLeftX = dividerRightX + oppositeCarriagewayWidth;
  const roadRightX = footpathOppositeLeftX + ROAD.footpathWidth;

  return {
    roadLeftX,
    footpathPlayerRightX,
    dividerLeftX,
    dividerRightX,
    footpathOppositeLeftX,
    roadRightX,
  };
}
