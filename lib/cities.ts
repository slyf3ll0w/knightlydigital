export type City = {
  name: string;
  slug: string;
  blurb: string;
};

export const cities: City[] = [
  {
    name: "Allen",
    slug: "allen-tx",
    blurb: "the heart of Collin County",
  },
  {
    name: "Plano",
    slug: "plano-tx",
    blurb: "the corporate hub of North Texas",
  },
  {
    name: "Frisco",
    slug: "frisco-tx",
    blurb: "one of the fastest-growing cities in America",
  },
  {
    name: "McKinney",
    slug: "mckinney-tx",
    blurb: "a thriving historic city in Collin County",
  },
  {
    name: "Dallas",
    slug: "dallas-tx",
    blurb: "the economic capital of North Texas",
  },
  {
    name: "Richardson",
    slug: "richardson-tx",
    blurb: "the Telecom Corridor of the DFW Metroplex",
  },
  {
    name: "Garland",
    slug: "garland-tx",
    blurb: "a vibrant city on the east side of Dallas County",
  },
  {
    name: "Anna",
    slug: "anna-tx",
    blurb: "a rapidly expanding community in northern Collin County",
  },
  {
    name: "Melissa",
    slug: "melissa-tx",
    blurb: "a growing suburb at the edge of the DFW Metroplex",
  },
  {
    name: "Prosper",
    slug: "prosper-tx",
    blurb: "one of the premier master-planned communities in DFW",
  },
  {
    name: "Grapevine",
    slug: "grapevine-tx",
    blurb: "the Christmas Capital of Texas near DFW Airport",
  },
  {
    name: "Colleyville",
    slug: "colleyville-tx",
    blurb: "an affluent community between Fort Worth and Dallas",
  },
  {
    name: "Grand Prairie",
    slug: "grand-prairie-tx",
    blurb: "a diverse city connecting Dallas and Fort Worth",
  },
  {
    name: "Arlington",
    slug: "arlington-tx",
    blurb: "the Entertainment Capital of North Texas",
  },
  {
    name: "Fort Worth",
    slug: "fort-worth-tx",
    blurb: "the City of Cowboys and Culture",
  },
  {
    name: "Hurst",
    slug: "hurst-tx",
    blurb: "a thriving mid-cities community in Tarrant County",
  },
  {
    name: "Rockwall",
    slug: "rockwall-tx",
    blurb: "the smallest county seat in Texas on the shores of Lake Ray Hubbard",
  },
  {
    name: "Rowlett",
    slug: "rowlett-tx",
    blurb: "a lakeside city growing fast on the eastern edge of the Metroplex",
  },
  {
    name: "North Richland Hills",
    slug: "north-richland-hills-tx",
    blurb: "a dynamic city in the heart of Tarrant County",
  },
  {
    name: "Keller",
    slug: "keller-tx",
    blurb: "a premier suburb in the northwest corridor of DFW",
  },
  {
    name: "Denton",
    slug: "denton-tx",
    blurb: "a university city anchoring the northwest corner of the Metroplex",
  },
];

export const primaryCity = cities[0];

export function getCityBySlug(slug: string): City | undefined {
  return cities.find((c) => c.slug === slug);
}

export function getAllCitySlugs(): string[] {
  return cities.slice(1).map((c) => c.slug);
}
