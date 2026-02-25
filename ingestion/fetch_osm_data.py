import requests
import json
import os

# The Overpass API is a read-only API that serves up custom selected parts of the OpenStreetMap map data.
OVERPASS_URL = "http://overpass-api.de/api/interpreter"

# Roughly the bounding box for CU Boulder main campus
# Format: min_lat, min_lon, max_lat, max_lon
CU_BBOX = "39.998,-105.275,40.013,-105.253"

# Overpass QL query to fetch buildings and footways/paths
overpass_query = f"""
[out:json];
(
  // Fetch campus buildings
  way["building"]({CU_BBOX});
  // Fetch walking paths, steps, pedestrian areas
  way["highway"~"footway|path|pedestrian|steps"]({CU_BBOX});
  // Fetch amenities like restrooms, etc.
  node["amenity"]({CU_BBOX});
  // Fetch accessibility nodes like elevators
  node["highway"~"elevator"]({CU_BBOX});
);
out body;
>;
out skel qt;
"""

def fetch_campus_data():
    print("Fetching CU Boulder map data from OpenStreetMap API...")
    
    # We send a POST request with our query to the Overpass API
    response = requests.post(OVERPASS_URL, data={'data': overpass_query})
    
    if response.status_code == 200:
        data = response.json()
        output_file = os.path.join(os.path.dirname(__file__), "cu_boulder_osm_data.json")
        
        # Save the result into a local JSON file to be ingested by Neo4j later
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)
            
        print(f"Success! Data saved to {output_file}.")
        print(f"Downloaded {len(data['elements'])} map elements (nodes/ways).")
    else:
        print(f"Failed to fetch data. HTTP Status: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    fetch_campus_data()
