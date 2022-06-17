#!/bin/bash

update_segments () {
  mkdir -p ./misc/segments4;

  # SW Ontario
  SW_corner_lat=40
  SW_corner_lon=-90
  NE_corner_lat=50
  NE_corner_lon=-70
  for W in $(seq $((-NE_corner_lon - 5)) 5 $((0 - SW_corner_lon)))
  do
    for N in $(seq $SW_corner_lat 5 $((NE_corner_lat - 5)))
    do
      echo ""
      echo "Downloading W${W}_N${N}"
      curl -o ./misc/segments4/W${W}_N${N}.rd5 http://brouter.de/brouter/segments4/W${W}_N${N}.rd5
    done
  done

  # BC/Calgary
  SW_corner_lat=45
  SW_corner_lon=-135
  NE_corner_lat=55
  NE_corner_lon=-110
  for W in $(seq $((-NE_corner_lon - 5)) 5 $((0 - SW_corner_lon)))
  do
    for N in $(seq $SW_corner_lat 5 $((NE_corner_lat - 5)))
    do
      echo ""
      echo "Downloading W${W}_N${N}"
      curl -o ./misc/segments4/W${W}_N${N}.rd5 http://brouter.de/brouter/segments4/W${W}_N${N}.rd5
    done
  done

}

update_segments