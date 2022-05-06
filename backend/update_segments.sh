#!/bin/bash

update_segments () {
  mkdir -p ./misc/segments4;
  curl -o ./misc/segments4/W80_N40.rd5 http://brouter.de/brouter/segments4/W80_N40.rd5
  curl -o ./misc/segments4/W80_N45.rd5 http://brouter.de/brouter/segments4/W80_N45.rd5
  curl -o ./misc/segments4/W85_N40.rd5 http://brouter.de/brouter/segments4/W85_N40.rd5
  curl -o ./misc/segments4/W85_N45.rd5 http://brouter.de/brouter/segments4/W85_N45.rd5
}

update_segments