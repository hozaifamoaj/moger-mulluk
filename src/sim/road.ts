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

export function computeRoadEdges(): RoadEdges {
  const playerCarriagewayWidth = ROAD.laneWidth * ROAD.playerLanes;
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
