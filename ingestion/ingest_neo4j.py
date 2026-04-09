import json
import math
import os
import re
from dotenv import load_dotenv
from neo4j import GraphDatabase

# Loading environment variables from the .env file in the ingestion folder
load_dotenv()

WALKABLE_HIGHWAYS = {'footway', 'path', 'pedestrian', 'steps'}

MANUAL_PLACE_ALIASES = {
    'Center for Community (C4C)': ['c4c'],
    'University Memorial Center': ['umc'],
    'Norlin Library': ['norlin'],
    'Mechanical Wing': ['engineering center', 'eng center', 'engr center'],
}


def normalize_search_term(value):
    return re.sub(r'\s+', ' ', re.sub(r'[()&/,-]', ' ', value.lower())).strip()


def build_search_terms(name=None, short_name=None, extra_aliases=None):
    search_terms = set()

    def add_term(raw_value):
        if not raw_value:
            return

        normalized_value = normalize_search_term(raw_value)
        if normalized_value:
            search_terms.add(normalized_value)

    add_term(name)
    add_term(short_name)

    if name and '(' in name and ')' in name:
        without_parenthetical = re.sub(r'\([^)]*\)', '', name).strip()
        add_term(without_parenthetical)
        parenthetical_groups = re.findall(r'\(([^)]*)\)', name)
        for parenthetical_group in parenthetical_groups:
            add_term(parenthetical_group)

    if name:
        initials = ''.join(
            word[0]
            for word in re.split(r'[^A-Za-z0-9]+', name)
            if word and len(word) > 2
        )
        if len(initials) >= 3:
            add_term(initials)

    for alias in extra_aliases or []:
        add_term(alias)

    return sorted(search_terms)


def haversine_distance_meters(lat1, lon1, lat2, lon2):
    earth_radius_meters = 6371000
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    lat_delta = lat2_rad - lat1_rad
    lon_delta = lon2_rad - lon1_rad

    haversine_value = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(lon_delta / 2) ** 2
    )
    arc = 2 * math.atan2(math.sqrt(haversine_value), math.sqrt(1 - haversine_value))
    return earth_radius_meters * arc


def infer_accessibility(tags):
    highway = (tags.get('highway') or '').lower()
    wheelchair = (tags.get('wheelchair') or '').lower()
    ramp = (tags.get('ramp') or '').lower()

    if highway == 'steps' or wheelchair in {'no', 'limited'} or ramp == 'no':
        return False

    if wheelchair == 'yes' or ramp == 'yes':
        return True

    return None


def infer_lighting(tags):
    lit = (tags.get('lit') or '').lower()
    if lit == 'yes':
        return True
    if lit == 'no':
        return False
    return None


def parse_step_count(tags):
    raw_step_count = tags.get('step_count')
    if raw_step_count is None:
        return None

    try:
        return int(raw_step_count)
    except (TypeError, ValueError):
        return None


class Neo4jIngestor:
    def __init__(self):
        uri = os.getenv('NEO4J_URI')
        user = os.getenv('NEO4J_USERNAME')
        password = os.getenv('NEO4J_PASSWORD')

        if not uri or not password:
            raise ValueError('Missing Neo4j credentials in .env file!')

        print('Connecting to a Neo4j Aura DB...')
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def reset_graph(self):
        print('Resetting the existing PathNode graph...')
        with self.driver.session() as session:
            session.run('MATCH (n:PathNode) DETACH DELETE n')

    def load_osm_data(self, file_path):
        print(f'Loading data from {file_path}...')

        with open(file_path, 'r') as f:
            data = json.load(f)

        nodes = []
        ways = []

        for element in data.get('elements', []):
            if element.get('type') == 'node':
                nodes.append(element)
            elif element.get('type') == 'way':
                ways.append(element)

        print(f'Found {len(nodes)} nodes and {len(ways)} ways')
        return nodes, ways

    def add_nodes(self, nodes):
        print(f'Uploading {len(nodes)} nodes to Neo4j. This might take a minute...')

        query = '''
        UNWIND $batch AS n
        MERGE (node:PathNode {id: n.id})
        SET node.latitude = n.lat,
            node.longitude = n.lon,
            node.tags = n.tags,
            node.name = n.name,
            node.short_name = n.short_name,
            node.search_terms = n.search_terms
        '''

        prepared_nodes = []
        for node in nodes:
            tags = node.get('tags', {}) if isinstance(node.get('tags'), dict) else {}
            name = tags.get('name')
            short_name = tags.get('short_name')
            search_terms = build_search_terms(
                name,
                short_name,
                MANUAL_PLACE_ALIASES.get(name, []),
            )

            prepared_nodes.append({
                'id': node['id'],
                'lat': node.get('lat'),
                'lon': node.get('lon'),
                'tags': json.dumps(tags),
                'name': name,
                'short_name': short_name,
                'search_terms': search_terms,
            })

        with self.driver.session() as session:
            for chunk in (prepared_nodes[i:i + 1000] for i in range(0, len(prepared_nodes), 1000)):
                session.run(query, batch=chunk)

        print('Nodes uploaded successfully.')

    def add_edges(self, ways, node_coords):
        walkable_ways = [
            way for way in ways if (way.get('tags', {}) or {}).get('highway') in WALKABLE_HIGHWAYS
        ]
        print(f'Uploading {len(walkable_ways)} walkable ways to Neo4j')

        query = '''
        UNWIND $batch AS edge
        MATCH (a:PathNode {id: edge.start_id})
        MATCH (b:PathNode {id: edge.end_id})
        SET a.is_walkable = true,
            b.is_walkable = true
        MERGE (a)-[r:CONNECTS_TO]->(b)
        SET r.distance_meters = edge.distance_meters,
            r.highway = edge.highway,
            r.surface = edge.surface,
            r.incline = edge.incline,
            r.step_count = edge.step_count,
            r.is_accessible = edge.is_accessible,
            r.is_lit = edge.is_lit
        MERGE (b)-[r2:CONNECTS_TO]->(a)
        SET r2.distance_meters = edge.distance_meters,
            r2.highway = edge.highway,
            r2.surface = edge.surface,
            r2.incline = edge.incline,
            r2.step_count = edge.step_count,
            r2.is_accessible = edge.is_accessible,
            r2.is_lit = edge.is_lit
        '''

        edges = []
        for way in walkable_ways:
            tags = way.get('tags', {}) or {}
            way_nodes = way.get('nodes', [])
            for index in range(len(way_nodes) - 1):
                start_id = way_nodes[index]
                end_id = way_nodes[index + 1]
                start_coords = node_coords.get(start_id)
                end_coords = node_coords.get(end_id)
                if not start_coords or not end_coords:
                    continue

                edges.append({
                    'start_id': start_id,
                    'end_id': end_id,
                    'distance_meters': haversine_distance_meters(
                        start_coords[0],
                        start_coords[1],
                        end_coords[0],
                        end_coords[1],
                    ),
                    'highway': tags.get('highway'),
                    'surface': tags.get('surface'),
                    'incline': tags.get('incline'),
                    'step_count': parse_step_count(tags),
                    'is_accessible': infer_accessibility(tags),
                    'is_lit': infer_lighting(tags),
                })

        with self.driver.session() as session:
            for chunk in (edges[i:i + 1000] for i in range(0, len(edges), 1000)):
                session.run(query, batch=chunk)

        print('Edges uploaded successfully.')

    def collect_named_places(self, ways, nodes, node_coords):
        named_places = []

        for way in ways:
            tags = way.get('tags', {}) or {}
            name = tags.get('name')
            way_nodes = way.get('nodes', [])
            if not name or not way_nodes:
                continue

            lats = []
            lons = []
            for node_id in way_nodes:
                coords = node_coords.get(node_id)
                if coords:
                    lats.append(coords[0])
                    lons.append(coords[1])

            if not lats:
                continue

            named_places.append({
                'name': name,
                'short_name': tags.get('short_name'),
                'lat': sum(lats) / len(lats),
                'lon': sum(lons) / len(lons),
                'search_terms': build_search_terms(
                    name,
                    tags.get('short_name'),
                    MANUAL_PLACE_ALIASES.get(name, []),
                ),
            })

        for node in nodes:
            tags = node.get('tags', {}) or {}
            name = tags.get('name')
            if not name or node.get('lat') is None or node.get('lon') is None:
                continue

            named_places.append({
                'name': name,
                'short_name': tags.get('short_name'),
                'lat': node.get('lat'),
                'lon': node.get('lon'),
                'search_terms': build_search_terms(
                    name,
                    tags.get('short_name'),
                    MANUAL_PLACE_ALIASES.get(name, []),
                ),
            })

        print(f'Collected {len(named_places)} named places for snapping.')
        return named_places

    def tag_named_places(self, named_places):
        print('Tagging nearest walkable nodes with searchable place names...')

        query = '''
        UNWIND $batch AS item
        MATCH (n:PathNode {is_walkable: true})
        WITH item, n, point.distance(
            point({latitude: item.lat, longitude: item.lon}),
            point({latitude: n.latitude, longitude: n.longitude})
        ) AS dist
        ORDER BY dist ASC
        LIMIT 1
        SET n.place_name = coalesce(n.place_name, item.name),
            n.place_short_name = coalesce(n.place_short_name, item.short_name),
            n.building_name = coalesce(n.building_name, item.name),
            n.search_terms = coalesce(n.search_terms, []) + item.search_terms
        '''

        with self.driver.session() as session:
            for place in named_places:
                session.run(query, batch=[place])

        print('Named places tagged successfully.')


if __name__ == "__main__":
    ingestor = Neo4jIngestor()
    print('Connection successful!')

    data_file_path = os.path.join(os.path.dirname(__file__), 'cu_boulder_osm_data.json')
    nodes, ways = ingestor.load_osm_data(data_file_path)
    node_coords = {
        node['id']: (node.get('lat'), node.get('lon'))
        for node in nodes
        if node.get('lat') is not None and node.get('lon') is not None
    }

    ingestor.reset_graph()
    ingestor.add_nodes(nodes)
    ingestor.add_edges(ways, node_coords)
    named_places = ingestor.collect_named_places(ways, nodes, node_coords)
    ingestor.tag_named_places(named_places)
    ingestor.close()
