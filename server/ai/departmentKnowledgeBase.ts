export interface DepartmentKnowledgeEntry {
  category:
    | 'Road maintenance'
    | 'Sanitation'
    | 'Street lighting'
    | 'Water supply'
    | 'Drainage';
  departmentCode: string;
  standardSops: string[];
  safetyProtocols: string[];
  standardEquipment: string[];
  defaultHoursRange: [number, number];
}

export const DEPARTMENT_KNOWLEDGE_BASE: Record<string, DepartmentKnowledgeEntry> = {
  'Road maintenance': {
    category: 'Road maintenance',
    departmentCode: 'PWD-RD',
    standardSops: [
      'Dispatch road engineering supervisor to inspect carriageway damage, measure depth/span, and mark hazard perimeter with reflective barricades.',
      'Clear loose aggregate, standing water, or debris from road cavity before material application.',
      'Apply cold-mix/hot-mix asphalt patching or structural slab repair and compact flush with road grade.',
      'Restore lane markings/signage and capture geotagged post-repair photograph for officer verification.',
    ],
    safetyProtocols: [
      'Place traffic cones and amber warning lights 30m upstream of active carriageway hazard.',
      'Issue immediate structural barricade if pothole depth exceeds 150mm or manhole frame is exposed.',
    ],
    standardEquipment: [
      'Asphalt patch crew, vibratory plate compactor, reflective traffic cones, hot/cold bitumen mix',
    ],
    defaultHoursRange: [12, 72],
  },
  Sanitation: {
    category: 'Sanitation',
    departmentCode: 'SWM-SN',
    standardSops: [
      'Assign ward sanitary inspector to verify waste accumulation volume, bio-hazard status, and bin availability.',
      'Deploy hydraulic compactor tipper or mechanical sweeper to clear accumulated municipal solid waste.',
      'Disinfect site perimeter with lime/sodium hypochlorite solution and inspect nearby secondary collection point.',
      'Confirm collection schedule compliance with ward beat supervisor and record post-clearance photograph.',
    ],
    safetyProtocols: [
      'Equip sanitation crew with PPE gloves, masks, and reflective vests before handling mixed or medical waste.',
      'Prioritize clearance within 12 hours near schools, clinics, and market corridors.',
    ],
    standardEquipment: [
      'Tipper collection vehicle, mechanical loader, disinfectant sprayer, PPE kits, replacement litter bins',
    ],
    defaultHoursRange: [6, 36],
  },
  'Street lighting': {
    category: 'Street lighting',
    departmentCode: 'UES-LT',
    standardSops: [
      'Dispatch electrical maintenance technician with pole number/feeder zone log to isolate faulty luminaire or feeder pillar.',
      'Test line voltage, MCB/timer relay, and underground cable continuity while ensuring isolation lockout.',
      'Replace defective LED driver, fixture, or corroded junction terminal and restore feeder circuit.',
      'Verify night-time illumination across span and upload post-repair verification photo.',
    ],
    safetyProtocols: [
      'De-energize feeder circuit and lock-out/tag-out before climbing hydraulic ladder if exposed wiring or sparks are reported.',
      'Maintain safe clearance from overhead LT/HT conductors.',
    ],
    standardEquipment: [
      'Insulated hydraulic bucket truck, digital multimeter, replacement LED luminaire/driver, insulated PPE',
    ],
    defaultHoursRange: [4, 36],
  },
  'Water supply': {
    category: 'Water supply',
    departmentCode: 'JLB-WS',
    standardSops: [
      'Send Jal Board valve inspector to check distribution pressure, pipeline leakage, or turbidity/contamination source.',
      'Isolate affected sub-main valve if burst/leakage is active and collect water sample for residual chlorine & coliform testing.',
      'Excavate leak point, fit mechanical repair clamp or replace damaged ferrule/pipe section, and flush line.',
      'Restore supply pressure, verify potable water clarity with citizen/ward check, and document repair photo.',
    ],
    safetyProtocols: [
      'Issue precautionary boil-water advisory if cross-contamination with sewer line is suspected.',
      'Shut sub-zone isolation valve immediately for high-volume main bursts undermining roadbed.',
    ],
    standardEquipment: [
      'Pipeline repair clamp kit, dewatering pump, chlorine field test kit, valve keys, excavation crew',
    ],
    defaultHoursRange: [4, 24],
  },
  Drainage: {
    category: 'Drainage',
    departmentCode: 'SWD-DR',
    standardSops: [
      'Dispatch stormwater/sewerage crew to inspect catch basin, silt trap, or damaged manhole cover.',
      'Secure open or collapsed manhole immediately with heavy steel safety barrier and warning signage.',
      'Deploy jetting/suction desilting machine to clear blockage and restore gravity flow.',
      'Seat heavy-duty ductile iron manhole cover or repair culvert collar and upload verification photo.',
    ],
    safetyProtocols: [
      'Strict no-entry rule for confined sewer chambers without gas detector clearance and full safety harness.',
      'Place rigid perimeter guard around open manholes within 2 hours of intake.',
    ],
    standardEquipment: [
      'Jetting-cum-suction tanker, H2S/methane gas detector, heavy-duty manhole cover, safety barricades',
    ],
    defaultHoursRange: [4, 36],
  },
};

export function getDepartmentKnowledgeBase(category: string): DepartmentKnowledgeEntry {
  return (
    DEPARTMENT_KNOWLEDGE_BASE[category] || DEPARTMENT_KNOWLEDGE_BASE['Road maintenance']
  );
}
