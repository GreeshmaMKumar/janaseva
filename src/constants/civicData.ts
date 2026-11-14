import type { ComplaintCategory, ComplaintStatus } from '../types/domain';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'codewithgreeshma26@gmail.com';

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'Road maintenance',
  'Sanitation',
  'Street lighting',
  'Water supply',
  'Drainage',
];

export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Info Requested',
  'Escalated',
  'Resolved',
  'Closed',
];

export const MUNICIPAL_WARDS: string[] = [
  'Ward 01 - Central Civic Zone',
  'Ward 02 - North Industrial Corridor',
  'Ward 03 - East Residential Enclave',
  'Ward 04 - South Market & Transit Hub',
  'Ward 05 - West Heritage Precinct',
  'Ward 06 - Tech Park & University Sector',
];

export const DEFAULT_DEPARTMENTS: Array<{
  id: string;
  name: string;
  code: string;
  category: ComplaintCategory;
  serviceArea: string;
  headOfficerName: string;
  contactEmail: string;
  slaHours: number;
  activeOfficers: number;
}> = [
  {
    id: 'dept-roads',
    name: 'Directorate of Roads & Highways',
    code: 'PWD-RD',
    category: 'Road maintenance',
    serviceArea: 'All Municipal Wards (Wards 01–06) · Arterial Roads & Footpaths',
    headOfficerName: 'Rajeshwari Iyer, IAS',
    contactEmail: 'roads.civic@janaseva.gov.in',
    slaHours: 48,
    activeOfficers: 14,
  },
  {
    id: 'dept-sanitation',
    name: 'Municipal Solid Waste & Sanitation Wing',
    code: 'SWM-SN',
    category: 'Sanitation',
    serviceArea: 'All Municipal Wards (Wards 01–06) · Collection & Public Hygiene',
    headOfficerName: 'Arvind Deshmukh',
    contactEmail: 'sanitation.civic@janaseva.gov.in',
    slaHours: 24,
    activeOfficers: 18,
  },
  {
    id: 'dept-lighting',
    name: 'Urban Electrical & Street Lighting Division',
    code: 'UES-LT',
    category: 'Street lighting',
    serviceArea: 'All Municipal Wards (Wards 01–06) · Streetlights & Junction Poles',
    headOfficerName: 'Meenakshi Nair',
    contactEmail: 'lighting.civic@janaseva.gov.in',
    slaHours: 24,
    activeOfficers: 9,
  },
  {
    id: 'dept-water',
    name: 'Jal Board & Potable Water Supply Authority',
    code: 'JLB-WS',
    category: 'Water supply',
    serviceArea: 'All Municipal Wards (Wards 01–06) · Pipelines & Potable Distribution',
    headOfficerName: 'Vikramaditya Singh',
    contactEmail: 'water.civic@janaseva.gov.in',
    slaHours: 18,
    activeOfficers: 12,
  },
  {
    id: 'dept-drainage',
    name: 'Stormwater Drainage & Sewerage Engineering',
    code: 'SWD-DR',
    category: 'Drainage',
    serviceArea: 'All Municipal Wards (Wards 01–06) · Storm Drains & Manhole Grids',
    headOfficerName: 'Dr. Kavita Kulkarni',
    contactEmail: 'drainage.civic@janaseva.gov.in',
    slaHours: 24,
    activeOfficers: 11,
  },
];

export const STATUS_PROGRESS_STEPS: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Closed',
];

export const HERO_BANNER_PATH = '/src/assets/images/civic_portal_hero_1794630212113.jpg';
export const SEAL_EMBLEM_PATH = '/src/assets/images/janaseva_seal_1794630211666.jpg';
