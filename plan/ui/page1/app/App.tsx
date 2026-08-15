import { useState } from "react";
import imgRoadCycling from "@/imports/RaceList11/4bafd90340d5cbeb25d57c6f635c6501fe6c0261.png";
import imgRaceRoad from "@/imports/RaceList11/62d22a6f1e33e8878e44c8d5db21daa1c4f00e09.png";
import imgRaceBlur from "@/imports/RaceList11/68728b6230eb9b14c8dbd085d845b3e6db748404.png";
import imgMountainBike from "@/imports/RaceList11/b5767e8287b1557f1da9333762bb93bc3031d0f5.png";
import imgRaceCyclists from "@/imports/RaceList11/cf30956d9054591cc5eebd0274e5194354eef4f6.png";
import imgProfile from "@/imports/RaceList11/fc7df1739873bf89fb11ae12e684961a291b5023.png";
import svgPaths from "@/imports/RaceList11/svg-72tn8rdl4x";

// SQL-style data tables
type RaceStatus = "Active" | "On Progress" | "Finished";

interface Race {
  id: number;
  name: string;
  status: RaceStatus;
  date: string;
  country: string;
  time: string;
  stage: string;
  image: string | null;
}

interface FeaturedRace {
  id: number;
  name: string;
  timeRange: string;
  stage: string;
  image: string;
  canManage: boolean;
}

const races: Race[] = [
  {
    id: 1,
    name: "Race",
    status: "Active",
    date: "12-15/8",
    country: "Israel",
    time: "9:00 am",
    stage: "Stage 12",
    image: null,
  },
  {
    id: 2,
    name: "Race Name",
    status: "On Progress",
    date: "3/9",
    country: "Israel",
    time: "9:00 am",
    stage: "Stage 12",
    image: imgRaceRoad,
  },
  {
    id: 3,
    name: "Race Name",
    status: "Finished",
    date: "3/9",
    country: "Israel",
    time: "9:00 am",
    stage: "Stage 12",
    image: imgRaceCyclists,
  },
  {
    id: 4,
    name: "Race Name",
    status: "Active",
    date: "12-15/8",
    country: "Israel",
    time: "9:00 am",
    stage: "Stage 12",
    image: imgRaceBlur,
  },
  {
    id: 5,
    name: "Tour de France",
    status: "Active",
    date: "1-23/7",
    country: "France",
    time: "10:00 am",
    stage: "Stage 7",
    image: imgRaceRoad,
  },
  {
    id: 6,
    name: "Giro d'Italia",
    status: "Finished",
    date: "5-28/5",
    country: "Italy",
    time: "9:30 am",
    stage: "Stage 21",
    image: imgRaceCyclists,
  },
  {
    id: 7,
    name: "Vuelta a España",
    status: "On Progress",
    date: "15/8",
    country: "Spain",
    time: "8:00 am",
    stage: "Stage 3",
    image: imgRaceBlur,
  },
];

const myRaces: FeaturedRace[] = [
  {
    id: 1,
    name: "Race Name",
    timeRange: "9:00 am - 6:30 pm",
    stage: "Stage 12",
    image: imgRoadCycling,
    canManage: true,
  },
  {
    id: 2,
    name: "Race Name",
    timeRange: "9:00 am - 6:30 pm",
    stage: "Stage 12",
    image: imgMountainBike,
    canManage: false,
  },
];

// Icon components
function CalendarIcon({ color = "#293042" }: { color?: string }) {
  return (
    <svg fill="none" height="11.57" viewBox="0 0 11.5 11.57" width="11.5">
      <path d="M11 4.07H0.5" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.41667 0.5V1.80667" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.08333 0.5V1.80667" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <path d={svgPaths.p37bb7380} stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ color = "#293042" }: { color?: string }) {
  return (
    <svg fill="none" height="11.5" viewBox="0 0 11.5 11.5" width="11.5">
      <path d={svgPaths.pc5b3680} stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <path d={svgPaths.pbb83980} stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlagIcon({ color = "#293042" }: { color?: string }) {
  return (
    <svg fill="none" height="13.2498" viewBox="0 0 11.5 13.2498" width="11.5">
      <path
        clipRule="evenodd"
        d={svgPaths.p3035e00}
        fillRule="evenodd"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={svgPaths.p34eeb00} stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <path d={svgPaths.p2e522f00} stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <path d={svgPaths.p259109c0} stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <path d={svgPaths.p261eec80} stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddRaceIcon() {
  return (
    <svg fill="none" height="13.2" viewBox="0 0 13.2 13.2" width="13.2">
      <path
        clipRule="evenodd"
        d={svgPaths.pb4d5d80}
        fillRule="evenodd"
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M6.6 3.93333V9.26667"
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M9.26667 6.6H3.93333"
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg fill="none" height="12.5396" viewBox="0 0 11.8667 12.5396" width="11.8667">
      <path
        d={svgPaths.p3f99e900}
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d={svgPaths.p19f5c280}
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg fill="none" height="11.9713" viewBox="0 0 11.8669 11.9713" width="11.8669">
      <path
        clipRule="evenodd"
        d={svgPaths.p3b652a00}
        fillRule="evenodd"
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d={svgPaths.pda7cce0}
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg fill="none" height="13.2" viewBox="0 0 19.2 13.2" width="19.2">
      <path
        d="M0.6 0.6H18.6"
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M14.6 6.6H0.6"
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path
        d="M0.6 12.6H10.6"
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg fill="none" height="17.1999" viewBox="0 0 17.2001 17.1999" width="17.2001">
      <path
        d={svgPaths.p14592b00}
        stroke="#293042"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

// Status tag config
const STATUS_CONFIG: Record<RaceStatus, { bg: string; text: string; label: string }> = {
  Active: { bg: "bg-[rgba(62,221,164,0.17)]", text: "text-[#3edda4]", label: "Active" },
  "On Progress": { bg: "bg-[rgba(99,166,252,0.17)]", text: "text-[#63a6fc]", label: "On Progress" },
  Finished: { bg: "bg-[rgba(41,48,66,0.17)]", text: "text-[#293042]", label: "Finished" },
};

function StatusTag({ status }: { status: RaceStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-[3px] ${cfg.bg} ${cfg.text} text-[10px] whitespace-nowrap`}
    >
      {cfg.label}
    </span>
  );
}

function PlaceholderImage() {
  return (
    <div className="w-[90px] h-[94px] rounded-[10px] bg-[rgba(41,48,66,0.12)] flex items-center justify-center flex-shrink-0">
      <svg fill="none" height="24" viewBox="0 0 32 32" width="24">
        <path
          d="M18.6 11.6V15.6"
          stroke="#293042"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />
        <path
          d="M16.6 13.6H20.6"
          stroke="#293042"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />
        <path
          d={svgPaths.p33aa4980}
          stroke="#293042"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />
        <path
          d={svgPaths.p20246f00}
          stroke="#293042"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}

function RaceCard({ race }: { race: Race }) {
  return (
    <div className="bg-white rounded-[10px] shadow-[0px_0px_12px_0px_rgba(41,48,66,0.06)] flex items-center px-1.5 py-1.5 gap-3 w-full">
      {race.image ? (
        <div className="w-[90px] h-[94px] rounded-[10px] overflow-hidden flex-shrink-0 relative">
          <img src={race.image} alt={race.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 rounded-[10px] bg-gradient-to-b from-transparent from-[24%] to-[rgba(0,0,0,0.23)]" />
        </div>
      ) : (
        <PlaceholderImage />
      )}
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className=" text-[16px] text-[#293042] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {race.name}
          </p>
          <StatusTag status={race.status} />
        </div>
        <div className="grid grid-cols-2 gap-y-1 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
              <CalendarIcon />
            </div>
            <span className=" text-[11px] text-black">{race.date}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
              <FlagIcon />
            </div>
            <span className=" text-[11px] text-black">{race.country}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
              <ClockIcon />
            </div>
            <span className=" text-[11px] text-[#212529]">{race.time}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <svg fill="none" height="8.56" viewBox="0 0 11.5 8.56" width="11.5">
                <path
                  d="M10.125 3.11771V4.86771"
                  stroke="#293042"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.25 3.99271H11"
                  stroke="#293042"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={svgPaths.p2bcfa4f2}
                  stroke="#293042"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={svgPaths.p3b8bbc80}
                  stroke="#293042"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className=" text-[11px] text-black">{race.stage}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedRaceCard({ race }: { race: FeaturedRace }) {
  return (
    <div className="flex-1 min-w-0 h-[147px] rounded-[10px] relative overflow-hidden">
      <img src={race.image} alt={race.name} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[24%] to-[rgba(0,0,0,0.6)]" />
      {race.canManage && (
        <div
          className="absolute top-0 left-0 right-0 h-9 rounded-tl-[8px] rounded-tr-[8px] flex items-center px-3 gap-2"
          style={{
            background:
              "linear-gradient(90deg, rgba(62,221,164,0.17) 0%, rgba(62,221,164,0.17) 100%), linear-gradient(90deg, #fff 0%, #fff 100%)",
          }}
        >
          <span className=" text-[13px] text-[#3edda4]">Manage Race</span>
          <svg fill="none" height="5.2" viewBox="0 0 9.2 5.2" width="9.2">
            <path
              d="M0.6 4.6L4.6 0.6L8.6 4.6"
              stroke="#3EDDA4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </svg>
        </div>
      )}
      {!race.canManage && (
        <div className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center">
          <svg fill="none" height="24" viewBox="0 0 35.54 35.54" width="24">
            <path
              d={svgPaths.p3d7e5e00}
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </svg>
        </div>
      )}
      <div className="absolute bottom-3 left-3 right-3">
        <p className="font-['Inter'] font-semibold text-[16px] text-white leading-tight mb-1">
          {race.name}
        </p>
        <div className="flex items-center gap-1 mb-0.5">
          <div className="w-3.5 h-3.5 flex items-center justify-center">
            <ClockIcon color="white" />
          </div>
          <span className=" text-[11px] text-white">{race.timeRange}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 flex items-center justify-center overflow-hidden">
            <svg fill="none" height="8.56" viewBox="0 0 11.5 8.56" width="11.5">
              <path
                d="M10.125 3.11771V4.86771"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.25 3.99271H11"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={svgPaths.p2bcfa4f2}
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={svgPaths.p3b8bbc80}
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className=" text-[11px] text-white">{race.stage}</span>
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className="bg-white rounded-b-[16px] shadow-[0px_4px_4px_0px_rgba(41,48,66,0.02)] flex-shrink-0">
      {/* Status bar */}
      <div className="h-11 px-4 flex items-center justify-between">
        <span className=" text-[15px] font-semibold text-[#293042]">9:41</span>
        <div className="flex items-center gap-1">
          {/* Signal bars */}
          <svg fill="none" height="14" viewBox="0 0 20 14" width="20">
            <rect fill="#293042" height="8" rx="0.5" width="3" x="17" y="6" />
            <rect fill="#293042" height="6" rx="0.5" width="3" x="11" y="8" />
            <rect fill="#293042" height="4.5" rx="0.5" width="3" x="5.5" y="9.5" />
            <rect fill="rgba(41,48,66,0.18)" height="10" rx="0.5" width="3" x="0" y="4" />
          </svg>
          {/* Wifi */}
          <svg fill="none" height="12" viewBox="0 0 16 12" width="16">
            <path d="M8 9.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" fill="#293042" />
            <path
              d="M3.5 6.5C5 5 6.4 4.2 8 4.2c1.6 0 3 .8 4.5 2.3"
              stroke="#293042"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
            <path
              d="M1 3.5C3 1.5 5.4.5 8 .5c2.6 0 5 1 7 3"
              stroke="#293042"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          </svg>
          {/* Battery */}
          <svg fill="none" height="12" viewBox="0 0 25 12" width="25">
            <rect
              fill="#293042"
              height="10"
              rx="1.5"
              stroke="#293042"
              strokeWidth="1"
              width="21"
              x="0.5"
              y="1"
            />
            <rect fill="white" height="6" rx="0.5" width="17" x="2" y="3" />
            <path d="M22 4.5v3" stroke="#293042" strokeLinecap="round" strokeWidth="1.5" />
          </svg>
        </div>
      </div>
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between">
        <button className="w-8 h-8 flex items-center justify-center">
          <HamburgerIcon />
        </button>
        <span className=" text-[16px] lowercase text-[#63a6fc] tracking-wide">commissaire</span>
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <MessageIcon />
            <div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-[#63a6fc] rounded-full border-2 border-white" />
          </div>
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-[#63a6fc]">
            <img src={imgProfile} alt="Profile" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </div>
  );
}

type FilterState = "All" | RaceStatus;

export default function App() {
  const [activeFilter, setActiveFilter] = useState<FilterState>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const filtered = races.filter((r) => {
    const matchesStatus = activeFilter === "All" || r.status === activeFilter;
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.country.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const allCount = races.length;

  return (
    <div className="min-h-screen bg-[#e8eaed] flex items-start justify-center py-0">
      {/* Mobile container */}
      <div
        className="w-[375px] min-h-screen bg-[#f6f8fa] flex flex-col relative"
        style={{ fontFamily: "'Abel', sans-serif" }}
      >
        <TopBar />

        <div className="flex-1">
          {/* My Races section */}
          <div className="px-4 pt-5 pb-4">
            <p className=" text-[16px] text-[#293042] mb-3">My Races ({myRaces.length * 6})</p>
            <div className="flex gap-3">
              {myRaces.map((race) => (
                <FeaturedRaceCard key={race.id} race={race} />
              ))}
            </div>
          </div>

          {/* All Races section */}
          <div className="px-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <p className=" text-[16px] text-[#293042]">All Races ({allCount})</p>
              <div className="flex items-center gap-3">
                <button
                  className="w-4 h-4 flex items-center justify-center"
                  onClick={() => setShowSearch((v) => !v)}
                >
                  <SearchIcon />
                </button>
                <button className="w-4 h-4 flex items-center justify-center">
                  <FilterIcon />
                </button>
                <button className="w-4 h-4 flex items-center justify-center">
                  <AddRaceIcon />
                </button>
              </div>
            </div>

            {/* Search bar */}
            {showSearch && (
              <div className="mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search races..."
                  className="w-full bg-white rounded-[8px] px-3 py-2 font-[Abel] text-[14px] text-[#293042] placeholder-[rgba(41,48,66,0.4)] outline-none shadow-[0px_0px_8px_rgba(41,48,66,0.06)] border-0"
                  autoFocus
                />
              </div>
            )}

            {/* Filter tabs */}
            <div
              className="flex gap-2 mb-4 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {(["All", "Active", "On Progress", "Finished"] as FilterState[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full font-[Abel] text-[12px] transition-all ${
                    activeFilter === f
                      ? "bg-[#293042] text-white"
                      : "bg-white text-[#293042] shadow-[0px_0px_8px_rgba(41,48,66,0.06)]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Race list */}
            <div className="flex flex-col gap-3">
              {filtered.length === 0 ? (
                <div className="text-center py-10">
                  <p className=" text-[14px] text-[rgba(41,48,66,0.5)]">No races found</p>
                </div>
              ) : (
                filtered.map((race) => <RaceCard key={race.id} race={race} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
