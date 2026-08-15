import imgImage4 from "./4bafd90340d5cbeb25d57c6f635c6501fe6c0261.png";
import imgImage2 from "./62d22a6f1e33e8878e44c8d5db21daa1c4f00e09.png";
import imgImage from "./68728b6230eb9b14c8dbd085d845b3e6db748404.png";
import imgImage3 from "./b5767e8287b1557f1da9333762bb93bc3031d0f5.png";
import imgImage1 from "./cf30956d9054591cc5eebd0274e5194354eef4f6.png";
import imgImage5 from "./fc7df1739873bf89fb11ae12e684961a291b5023.png";
import svgPaths from "./svg-72tn8rdl4x";

type IndicatorProps = {
  className?: string;
  type?: "None";
};

function Indicator({ className, type = "None" }: IndicatorProps) {
  return <div className={className || "relative size-[6px]"} />;
}
type NotchProps = {
  className?: string;
  visible?: "NO";
};

function Notch({ className, visible = "NO" }: NotchProps) {
  return <div className={className || "h-[30px] relative w-[250px]"} />;
}

function Ic() {
  return (
    <div className="absolute inset-[22.97%_12.5%_23.01%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-6.61%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="8.56292"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 8.56292"
          width="11.5"
        >
          <g id="Ic">
            <path
              d="M10.125 3.11771V4.86771"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.25 3.99271H11"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2bcfa4f2}
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p3b8bbc80}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location() {
  return (
    <div className="absolute contents left-[276px] top-[775px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[776px] whitespace-nowrap"
        dir="auto"
      >
        Stage 12
      </p>
      <div className="absolute left-[276px] overflow-clip size-[14px] top-[775px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Ic />
      </div>
    </div>
  );
}

function Group() {
  return (
    <div className="absolute inset-[12.5%]" data-name="Group">
      <div className="absolute inset-[-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.5"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.5"
          width="11.5"
        >
          <g id="Group">
            <path
              d={svgPaths.pc5b3680}
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.pbb83980}
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Time() {
  return (
    <div className="absolute contents left-[123px] top-[775px]" data-name="Time">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[#212529] text-[11px] top-[776px] whitespace-nowrap"
        dir="auto"
      >
        9:00 am
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[775px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Vector" />
        </svg>
        <Group />
      </div>
    </div>
  );
}

function TimeStage() {
  return (
    <div className="absolute contents left-[123px] top-[775px]" data-name="Time & Stage">
      <Location />
      <Time />
    </div>
  );
}

function Ic1() {
  return (
    <div className="absolute inset-[4.17%_12.5%_8.33%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-4.08%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="13.2498"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 13.2498"
          width="11.5"
        >
          <g id="Ic">
            <path
              clipRule="evenodd"
              d={svgPaths.p3035e00}
              fillRule="evenodd"
              id="Stroke 21"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p34eeb00}
              id="Stroke 23"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2e522f00}
              id="Stroke 25"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p259109c0}
              id="Stroke 27"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p261eec80}
              id="Stroke 29"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location1() {
  return (
    <div className="absolute contents left-[276px] top-[753px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[754px] whitespace-nowrap"
        dir="auto"
      >
        Israel
      </p>
      <div className="absolute left-[276px] size-[14px] top-[753px]" data-name="Ic">
        <Ic1 />
      </div>
    </div>
  );
}

function Group1() {
  return (
    <div className="absolute inset-[12%_12.5%_12.5%_12.5%]" data-name="Group">
      <div className="absolute inset-[-4.73%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.57"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.57"
          width="11.5"
        >
          <g id="Group">
            <path
              d="M11 4.07H0.5"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.41667 0.5V1.80667"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.08333 0.5V1.80667"
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p37bb7380}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Date() {
  return (
    <div className="absolute contents left-[123px] top-[753px]" data-name="Date">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[11px] text-black top-[754px] whitespace-nowrap"
        dir="auto"
      >
        12-15/8
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[753px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Group1 />
      </div>
    </div>
  );
}

function DateCountry() {
  return (
    <div className="absolute contents left-[123px] top-[753px]" data-name="Date & Country">
      <Location1 />
      <Date />
    </div>
  );
}

function TitleTag() {
  return (
    <div className="absolute contents left-[123px] top-[717px]" data-name="Title & Tag">
      <div className="absolute h-[20px] left-[293px] top-[717px] w-[50px]" data-name="Tag">
        <div className="absolute bg-[rgba(62,221,164,0.17)] inset-0 rounded-[3px]" data-name="Bg" />
        <p className="[word-break:break-word] absolute bottom-1/4 font-['Abel:Regular',sans-serif] leading-[normal] left-[16%] not-italic right-[16%] text-[#3edda4] text-[11px] text-center top-[20%] whitespace-nowrap">
          Active
        </p>
      </div>
      <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Abel:Regular',sans-serif] justify-center leading-[0] left-[123px] not-italic text-[16px] text-black top-[727px] whitespace-nowrap">
        <p className="leading-[normal]" dir="auto">
          Race Name
        </p>
      </div>
    </div>
  );
}

function Text() {
  return (
    <div className="absolute contents left-[123px] top-[717px]" data-name="Text">
      <TimeStage />
      <DateCountry />
      <TitleTag />
    </div>
  );
}

function Card3() {
  return (
    <div className="absolute contents left-[16px] top-[701px]" data-name="Card / 4">
      <div
        className="absolute bg-white h-[104px] left-[16px] rounded-[10px] shadow-[0px_0px_12px_0px_rgba(41,48,66,0.03)] top-[701px] w-[343px]"
        data-name="Bg"
      />
      <Text />
      <div className="absolute flex h-[94px] items-center justify-center left-[21px] top-[706px] w-[90px]">
        <div className="-scale-y-100 flex-none rotate-180">
          <div className="h-[94px] relative rounded-[10px] w-[90px]" data-name="Image">
            <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[10px]">
              <div className="absolute inset-0 overflow-hidden rounded-[10px]">
                <img
                  alt=""
                  className="absolute h-[119.88%] left-[-5.07%] max-w-none top-[-6.84%] w-[163.33%]"
                  src={imgImage}
                />
              </div>
              <div className="absolute bg-gradient-to-b from-[23.978%] from-[rgba(0,0,0,0)] inset-0 rounded-[10px] to-[rgba(0,0,0,0.23)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ic2() {
  return (
    <div className="absolute inset-[22.97%_12.5%_23.01%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-6.61%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="8.56292"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 8.56292"
          width="11.5"
        >
          <g id="Ic">
            <path
              d="M10.125 3.11771V4.86771"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.25 3.99271H11"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2bcfa4f2}
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p3b8bbc80}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location2() {
  return (
    <div className="absolute contents left-[276px] top-[659px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[660px] whitespace-nowrap"
        dir="auto"
      >
        Stage 12
      </p>
      <div className="absolute left-[276px] overflow-clip size-[14px] top-[659px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Ic2 />
      </div>
    </div>
  );
}

function Group2() {
  return (
    <div className="absolute inset-[12.5%]" data-name="Group">
      <div className="absolute inset-[-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.5"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.5"
          width="11.5"
        >
          <g id="Group">
            <path
              d={svgPaths.pc5b3680}
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.pbb83980}
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Time1() {
  return (
    <div className="absolute contents left-[123px] top-[659px]" data-name="Time">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[#212529] text-[11px] top-[660px] whitespace-nowrap"
        dir="auto"
      >
        9:00 am
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[659px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Vector" />
        </svg>
        <Group2 />
      </div>
    </div>
  );
}

function TimeStage1() {
  return (
    <div className="absolute contents left-[123px] top-[659px]" data-name="Time & Stage">
      <Location2 />
      <Time1 />
    </div>
  );
}

function Ic3() {
  return (
    <div className="absolute inset-[4.17%_12.5%_8.33%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-4.08%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="13.2498"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 13.2498"
          width="11.5"
        >
          <g id="Ic">
            <path
              clipRule="evenodd"
              d={svgPaths.p3035e00}
              fillRule="evenodd"
              id="Stroke 21"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p34eeb00}
              id="Stroke 23"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2e522f00}
              id="Stroke 25"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p259109c0}
              id="Stroke 27"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p261eec80}
              id="Stroke 29"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location3() {
  return (
    <div className="absolute contents left-[276px] top-[637px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[638px] whitespace-nowrap"
        dir="auto"
      >
        Israel
      </p>
      <div className="absolute left-[276px] size-[14px] top-[637px]" data-name="Ic">
        <Ic3 />
      </div>
    </div>
  );
}

function Group3() {
  return (
    <div className="absolute inset-[12%_12.5%_12.5%_12.5%]" data-name="Group">
      <div className="absolute inset-[-4.73%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.57"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.57"
          width="11.5"
        >
          <g id="Group">
            <path
              d="M11 4.07H0.5"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.41667 0.5V1.80667"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.08333 0.5V1.80667"
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p37bb7380}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Date1() {
  return (
    <div className="absolute contents left-[123px] top-[637px]" data-name="Date">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[11px] text-black top-[638px] whitespace-nowrap"
        dir="auto"
      >
        3/9
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[637px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Group3 />
      </div>
    </div>
  );
}

function DateCountry1() {
  return (
    <div className="absolute contents left-[123px] top-[637px]" data-name="Date & Country">
      <Location3 />
      <Date1 />
    </div>
  );
}

function TitleTag1() {
  return (
    <div className="absolute contents left-[123px] top-[601px]" data-name="Title & Tag">
      <div className="absolute h-[20px] left-[283px] top-[601px] w-[60px]" data-name="Tag">
        <div className="absolute bg-[rgba(41,48,66,0.17)] inset-0 rounded-[3px]" data-name="Bg" />
        <p className="[word-break:break-word] absolute bottom-1/4 font-['Abel:Regular',sans-serif] leading-[normal] left-[13.33%] not-italic right-[13.33%] text-[#293042] text-[11px] text-center top-[20%] whitespace-nowrap">
          Finished
        </p>
      </div>
      <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Abel:Regular',sans-serif] justify-center leading-[0] left-[123px] not-italic text-[16px] text-black top-[611px] whitespace-nowrap">
        <p className="leading-[normal]" dir="auto">
          Race Name
        </p>
      </div>
    </div>
  );
}

function Text1() {
  return (
    <div className="absolute contents left-[123px] top-[601px]" data-name="Text">
      <TimeStage1 />
      <DateCountry1 />
      <TitleTag1 />
    </div>
  );
}

function Card2() {
  return (
    <div className="absolute contents left-[16px] top-[585px]" data-name="Card / 3">
      <div
        className="absolute bg-white h-[104px] left-[16px] rounded-[10px] shadow-[0px_0px_12px_0px_rgba(41,48,66,0.03)] top-[585px] w-[343px]"
        data-name="Bg"
      />
      <Text1 />
      <div className="absolute flex h-[94px] items-center justify-center left-[21px] top-[590px] w-[90px]">
        <div className="-scale-y-100 flex-none rotate-180">
          <div className="h-[94px] relative rounded-[10px] w-[90px]" data-name="Image">
            <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[10px]">
              <div className="absolute inset-0 overflow-hidden rounded-[10px]">
                <img
                  alt=""
                  className="absolute h-[115.17%] left-[-37.53%] max-w-none top-[-2.62%] w-[156.92%]"
                  src={imgImage1}
                />
              </div>
              <div className="absolute bg-gradient-to-b from-[23.978%] from-[rgba(0,0,0,0)] inset-0 rounded-[10px] to-[rgba(0,0,0,0.23)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ic4() {
  return (
    <div className="absolute inset-[22.97%_12.5%_23.01%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-6.61%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="8.56292"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 8.56292"
          width="11.5"
        >
          <g id="Ic">
            <path
              d="M10.125 3.11771V4.86771"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.25 3.99271H11"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2bcfa4f2}
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p3b8bbc80}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location4() {
  return (
    <div className="absolute contents left-[276px] top-[543px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[544px] whitespace-nowrap"
        dir="auto"
      >
        Stage 12
      </p>
      <div className="absolute left-[276px] overflow-clip size-[14px] top-[543px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Ic4 />
      </div>
    </div>
  );
}

function Group4() {
  return (
    <div className="absolute inset-[12.5%]" data-name="Group">
      <div className="absolute inset-[-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.5"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.5"
          width="11.5"
        >
          <g id="Group">
            <path
              d={svgPaths.pc5b3680}
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.pbb83980}
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Time2() {
  return (
    <div className="absolute contents left-[123px] top-[543px]" data-name="Time">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[#212529] text-[11px] top-[544px] whitespace-nowrap"
        dir="auto"
      >
        9:00 am
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[543px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Vector" />
        </svg>
        <Group4 />
      </div>
    </div>
  );
}

function TimeStage2() {
  return (
    <div className="absolute contents left-[123px] top-[543px]" data-name="Time & Stage">
      <Location4 />
      <Time2 />
    </div>
  );
}

function Ic5() {
  return (
    <div className="absolute inset-[4.17%_12.5%_8.33%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-4.08%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="13.2498"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 13.2498"
          width="11.5"
        >
          <g id="Ic">
            <path
              clipRule="evenodd"
              d={svgPaths.p3035e00}
              fillRule="evenodd"
              id="Stroke 21"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p34eeb00}
              id="Stroke 23"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2e522f00}
              id="Stroke 25"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p259109c0}
              id="Stroke 27"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p261eec80}
              id="Stroke 29"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location5() {
  return (
    <div className="absolute contents left-[276px] top-[521px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[522px] whitespace-nowrap"
        dir="auto"
      >
        Israel
      </p>
      <div className="absolute left-[276px] size-[14px] top-[521px]" data-name="Ic">
        <Ic5 />
      </div>
    </div>
  );
}

function Group5() {
  return (
    <div className="absolute inset-[12%_12.5%_12.5%_12.5%]" data-name="Group">
      <div className="absolute inset-[-4.73%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.57"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.57"
          width="11.5"
        >
          <g id="Group">
            <path
              d="M11 4.07H0.5"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.41667 0.5V1.80667"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.08333 0.5V1.80667"
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p37bb7380}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Date2() {
  return (
    <div className="absolute contents left-[123px] top-[521px]" data-name="Date">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[11px] text-black top-[522px] whitespace-nowrap"
        dir="auto"
      >
        3/9
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[521px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Group5 />
      </div>
    </div>
  );
}

function DateCountry2() {
  return (
    <div className="absolute contents left-[123px] top-[521px]" data-name="Date & Country">
      <Location5 />
      <Date2 />
    </div>
  );
}

function TitleTag2() {
  return (
    <div className="absolute contents left-[123px] top-[485px]" data-name="Title & Tag">
      <div className="absolute h-[20px] left-[261px] top-[485px] w-[82px]" data-name="Tag">
        <div className="absolute bg-[rgba(99,166,252,0.17)] inset-0 rounded-[3px]" data-name="Bg" />
        <p
          className="[word-break:break-word] absolute bottom-1/4 font-['Abel:Regular',sans-serif] leading-[normal] left-[9.76%] not-italic right-[9.76%] text-[#63a6fc] text-[11px] text-center top-[20%] whitespace-nowrap"
          dir="auto"
        >
          On Progress
        </p>
      </div>
      <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Abel:Regular',sans-serif] justify-center leading-[0] left-[123px] not-italic text-[16px] text-black top-[495px] whitespace-nowrap">
        <p className="leading-[normal]" dir="auto">
          Race Name
        </p>
      </div>
    </div>
  );
}

function Text2() {
  return (
    <div className="absolute contents left-[123px] top-[485px]" data-name="Text">
      <TimeStage2 />
      <DateCountry2 />
      <TitleTag2 />
    </div>
  );
}

function Card1() {
  return (
    <div className="absolute contents left-[16px] top-[469px]" data-name="Card / 2">
      <div
        className="absolute bg-white h-[104px] left-[16px] rounded-[10px] shadow-[0px_0px_12px_0px_rgba(41,48,66,0.03)] top-[469px] w-[343px]"
        data-name="Bg"
      />
      <Text2 />
      <div className="absolute flex h-[94px] items-center justify-center left-[21px] top-[474px] w-[90px]">
        <div className="-scale-y-100 flex-none rotate-180">
          <div className="h-[94px] relative rounded-[10px] w-[90px]" data-name="Image">
            <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[10px]">
              <div className="absolute inset-0 overflow-hidden rounded-[10px]">
                <img
                  alt=""
                  className="absolute h-[115.17%] left-[-37.53%] max-w-none top-[-2.62%] w-[156.92%]"
                  src={imgImage2}
                />
              </div>
              <div className="absolute bg-gradient-to-b from-[23.978%] from-[rgba(0,0,0,0)] inset-0 rounded-[10px] to-[rgba(0,0,0,0.23)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ic6() {
  return (
    <div className="absolute inset-[22.97%_12.5%_23.01%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-6.61%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="8.56292"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 8.56292"
          width="11.5"
        >
          <g id="Ic">
            <path
              d="M10.125 3.11771V4.86771"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.25 3.99271H11"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2bcfa4f2}
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p3b8bbc80}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location6() {
  return (
    <div className="absolute contents left-[276px] top-[427px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[428px] whitespace-nowrap"
        dir="auto"
      >
        Stage 12
      </p>
      <div className="absolute left-[276px] overflow-clip size-[14px] top-[427px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Ic6 />
      </div>
    </div>
  );
}

function Group6() {
  return (
    <div className="absolute inset-[12.5%]" data-name="Group">
      <div className="absolute inset-[-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.5"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.5"
          width="11.5"
        >
          <g id="Group">
            <path
              d={svgPaths.pc5b3680}
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.pbb83980}
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Time3() {
  return (
    <div className="absolute contents left-[123px] top-[427px]" data-name="Time">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[#212529] text-[11px] top-[428px] whitespace-nowrap"
        dir="auto"
      >
        9:00 am
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[427px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Vector" />
        </svg>
        <Group6 />
      </div>
    </div>
  );
}

function TimeStage3() {
  return (
    <div className="absolute contents left-[123px] top-[427px]" data-name="Time & Stage">
      <Location6 />
      <Time3 />
    </div>
  );
}

function Ic7() {
  return (
    <div className="absolute inset-[4.17%_12.5%_8.33%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-4.08%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="13.2498"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 13.2498"
          width="11.5"
        >
          <g id="Ic">
            <path
              clipRule="evenodd"
              d={svgPaths.p3035e00}
              fillRule="evenodd"
              id="Stroke 21"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p34eeb00}
              id="Stroke 23"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2e522f00}
              id="Stroke 25"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p259109c0}
              id="Stroke 27"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p261eec80}
              id="Stroke 29"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location7() {
  return (
    <div className="absolute contents left-[276px] top-[405px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[298px] not-italic text-[11px] text-black top-[406px] whitespace-nowrap"
        dir="auto"
      >
        Israel
      </p>
      <div className="absolute left-[276px] size-[14px] top-[405px]" data-name="Ic">
        <Ic7 />
      </div>
    </div>
  );
}

function Group7() {
  return (
    <div className="absolute inset-[12%_12.5%_12.5%_12.5%]" data-name="Group">
      <div className="absolute inset-[-4.73%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.57"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.57"
          width="11.5"
        >
          <g id="Group">
            <path
              d="M11 4.07H0.5"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.41667 0.5V1.80667"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.08333 0.5V1.80667"
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p37bb7380}
              id="Vector_4"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Date3() {
  return (
    <div className="absolute contents left-[123px] top-[405px]" data-name="Date">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[145px] not-italic text-[11px] text-black top-[406px] whitespace-nowrap"
        dir="auto"
      >
        12-15/8
      </p>
      <div className="absolute left-[123px] overflow-clip size-[14px] top-[405px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Group7 />
      </div>
    </div>
  );
}

function DateCountry3() {
  return (
    <div className="absolute contents left-[123px] top-[405px]" data-name="Date & Country">
      <Location7 />
      <Date3 />
    </div>
  );
}

function TitleTag3() {
  return (
    <div className="absolute contents left-[123px] top-[369px]" data-name="Title & Tag">
      <div className="absolute h-[20px] left-[293px] top-[369px] w-[50px]" data-name="Tag">
        <div className="absolute bg-[rgba(62,221,164,0.17)] inset-0 rounded-[3px]" data-name="Bg" />
        <p className="[word-break:break-word] absolute bottom-1/4 font-['Abel:Regular',sans-serif] leading-[normal] left-[16%] not-italic right-[16%] text-[#3edda4] text-[11px] text-center top-[20%] whitespace-nowrap">
          Active
        </p>
      </div>
      <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Abel:Regular',sans-serif] justify-center leading-[0] left-[123px] not-italic text-[16px] text-black top-[379px] whitespace-nowrap">
        <p className="leading-[normal]" dir="auto">{`Race `}</p>
      </div>
    </div>
  );
}

function Text3() {
  return (
    <div className="absolute contents left-[123px] top-[369px]" data-name="Text">
      <TimeStage3 />
      <DateCountry3 />
      <TitleTag3 />
    </div>
  );
}

function Ic8() {
  return (
    <div className="absolute inset-[12.5%_8.33%_12.5%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-64.44%_-87.37%_-20%_-8.42%]">
        <svg
          className="block size-full"
          fill="none"
          height="33.2"
          preserveAspectRatio="none"
          viewBox="0 0 37.2 33.2"
          width="37.2"
        >
          <g id="Ic">
            <path
              d="M18.6 11.6V15.6"
              id="Vector"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <g filter="url(#filter0_d_0_323)" id="Vector_2">
              <path
                d="M16.6 13.6H20.6"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.2"
              />
            </g>
            <path
              d={svgPaths.p33aa4980}
              id="Vector_3"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d={svgPaths.p20246f00}
              id="Vector_4"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </g>
          <defs>
            <filter
              colorInterpolationFilters="sRGB"
              filterUnits="userSpaceOnUse"
              height="33.2"
              id="filter0_d_0_323"
              width="37.2"
              x="0"
              y="3.57628e-07"
            >
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                result="hardAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              />
              <feOffset dy="3" />
              <feGaussianBlur stdDeviation="8" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.160784 0 0 0 0 0.188235 0 0 0 0 0.258824 0 0 0 0.06 0"
              />
              <feBlend in2="BackgroundImageFix" mode="normal" result="effect1_dropShadow_0_323" />
              <feBlend
                in="SourceGraphic"
                in2="effect1_dropShadow_0_323"
                mode="normal"
                result="shape"
              />
            </filter>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function Image() {
  return (
    <div className="absolute contents left-[21px] top-[358px]" data-name="Image">
      <div className="absolute flex h-[94px] items-center justify-center left-[21px] top-[358px] w-[90px]">
        <div className="-scale-y-100 flex-none rotate-180">
          <div
            className="backdrop-blur-[30px] bg-[rgba(41,48,66,0.17)] h-[94px] relative rounded-[10px] w-[90px]"
            data-name="Image"
          />
        </div>
      </div>
      <div className="absolute left-[54px] overflow-clip size-[24px] top-[393px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Bg" />
        </svg>
        <Ic8 />
      </div>
    </div>
  );
}

function Card() {
  return (
    <div className="absolute contents left-[16px] top-[353px]" data-name="Card / 1">
      <div
        className="absolute bg-white h-[104px] left-[16px] rounded-[10px] shadow-[0px_0px_12px_0px_rgba(41,48,66,0.03)] top-[353px] w-[343px]"
        data-name="Bg"
      />
      <Text3 />
      <Image />
    </div>
  );
}

function Cards() {
  return (
    <div className="absolute contents left-[16px] top-[353px]" data-name="Cards">
      <Card3 />
      <Card2 />
      <Card1 />
      <Card />
    </div>
  );
}

function Ic10() {
  return (
    <div className="absolute inset-[16.67%_16.67%_16.01%_16.67%]" data-name="Ic">
      <div className="absolute inset-[-5.57%_-5.63%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.9713"
          preserveAspectRatio="none"
          viewBox="0 0 11.8669 11.9713"
          width="11.8669"
        >
          <g id="Ic">
            <path
              clipRule="evenodd"
              d={svgPaths.p3b652a00}
              fillRule="evenodd"
              id="Stroke 1"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d={svgPaths.pda7cce0}
              id="Stroke 3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Ic11() {
  return (
    <div className="absolute inset-[16.63%_16.67%_12.51%_16.67%]" data-name="Ic">
      <div className="absolute inset-[-5.29%_-5.63%_-5.3%_-5.63%]">
        <svg
          className="block size-full"
          fill="none"
          height="12.5396"
          preserveAspectRatio="none"
          viewBox="0 0 11.8667 12.5396"
          width="11.8667"
        >
          <g id="Ic">
            <path
              d={svgPaths.p3f99e900}
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d={svgPaths.p19f5c280}
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Ic12() {
  return (
    <div className="absolute inset-[12.5%]" data-name="Ic">
      <div className="absolute inset-[-5%]">
        <svg
          className="block size-full"
          fill="none"
          height="13.2"
          preserveAspectRatio="none"
          viewBox="0 0 13.2 13.2"
          width="13.2"
        >
          <g id="Ic">
            <path
              clipRule="evenodd"
              d={svgPaths.pb4d5d80}
              fillRule="evenodd"
              id="Stroke 3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d="M6.6 3.93333V9.26667"
              id="Stroke 1"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d="M9.26667 6.6H3.93333"
              id="Stroke 2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Ic9() {
  return (
    <div className="absolute contents left-[287px] top-[325px]" data-name="Ic">
      <div className="absolute left-[343px] size-[16px] top-[325px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Bg" />
        </svg>
        <Ic10 />
      </div>
      <div className="absolute left-[315px] overflow-clip size-[16px] top-[325px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Bg" />
        </svg>
        <Ic11 />
      </div>
      <div className="absolute left-[287px] size-[16px] top-[325px]" data-name="Ic">
        <Ic12 />
      </div>
    </div>
  );
}

function TitleIc() {
  return (
    <div className="absolute contents left-[16px] top-[325px]" data-name="Title & Ic">
      <Ic9 />
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[16px] not-italic text-[#293042] text-[16px] top-[325px] whitespace-nowrap"
        dir="auto"
      >
        All Races (64)
      </p>
    </div>
  );
}

function AllRaces() {
  return (
    <div className="absolute contents left-[16px] top-[325px]" data-name="All Races">
      <Cards />
      <TitleIc />
    </div>
  );
}

function Group8() {
  return (
    <div className="absolute inset-[11.79%]" data-name="Group">
      <div className="absolute inset-[-30.53%_-46.89%_-63.25%_-46.89%]">
        <svg
          className="block size-full"
          fill="none"
          height="35.54"
          preserveAspectRatio="none"
          viewBox="0 0 35.54 35.54"
          width="35.54"
        >
          <g id="Group">
            <g filter="url(#filter0_d_0_333)" id="Vector">
              <path
                d={svgPaths.p124a5700}
                fill="#293042"
                fillOpacity="0.38"
                shapeRendering="crispEdges"
              />
              <path
                d={svgPaths.p124a5700}
                shapeRendering="crispEdges"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.2"
              />
            </g>
            <path
              d={svgPaths.p3d7e5e00}
              id="Vector_2"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d={svgPaths.p19413580}
              id="Vector_3"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d="M13.19 22.71V15.69"
              id="Vector_4"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </g>
          <defs>
            <filter
              colorInterpolationFilters="sRGB"
              filterUnits="userSpaceOnUse"
              height="35.54"
              id="filter0_d_0_333"
              width="35.54"
              x="3.57628e-07"
              y="-1.19209e-07"
            >
              <feFlood floodOpacity="0" result="BackgroundImageFix" />
              <feColorMatrix
                in="SourceAlpha"
                result="hardAlpha"
                type="matrix"
                values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              />
              <feOffset dy="3" />
              <feGaussianBlur stdDeviation="4" />
              <feComposite in2="hardAlpha" operator="out" />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0.160784 0 0 0 0 0.188235 0 0 0 0 0.258824 0 0 0 0.5 0"
              />
              <feBlend in2="BackgroundImageFix" mode="normal" result="effect1_dropShadow_0_333" />
              <feBlend
                in="SourceGraphic"
                in2="effect1_dropShadow_0_333"
                mode="normal"
                result="shape"
              />
            </filter>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function Ic13() {
  return (
    <div className="absolute inset-[22.97%_12.5%_23.01%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-6.61%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="8.56292"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 8.56292"
          width="11.5"
        >
          <g id="Ic">
            <path
              d="M10.125 3.11771V4.86771"
              id="Vector"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.25 3.99271H11"
              id="Vector_2"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2bcfa4f2}
              id="Vector_3"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p3b8bbc80}
              id="Vector_4"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location8() {
  return (
    <div className="absolute contents left-[259px] top-[275px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[281px] not-italic text-[11px] text-white top-[276px] whitespace-nowrap"
        dir="auto"
      >
        Stage 12
      </p>
      <div className="absolute left-[259px] overflow-clip size-[14px] top-[275px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Ic13 />
      </div>
    </div>
  );
}

function Group9() {
  return (
    <div className="absolute inset-[12.5%]" data-name="Group">
      <div className="absolute inset-[-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.5"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.5"
          width="11.5"
        >
          <g id="Group">
            <path
              d={svgPaths.pc5b3680}
              id="Vector"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.pbb83980}
              id="Vector_2"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Time4() {
  return (
    <div className="absolute contents left-[259px] top-[258px]" data-name="Time">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[281px] not-italic text-[11px] text-white top-[259px] whitespace-nowrap"
        dir="auto"
      >
        9:00 am - 6:30 pm
      </p>
      <div className="absolute left-[259px] overflow-clip size-[14px] top-[258px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Vector" />
        </svg>
        <Group9 />
      </div>
    </div>
  );
}

function Card4() {
  return (
    <div className="absolute contents left-[247px] top-[154px]" data-name="Card / 2">
      <div className="absolute flex h-[147px] items-center justify-center left-[247px] top-[154px] w-[219px]">
        <div className="-scale-y-100 flex-none rotate-180">
          <div className="h-[147px] relative rounded-[10px] w-[219px]" data-name="Image">
            <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[10px]">
              <img
                alt=""
                className="absolute max-w-none object-cover rounded-[10px] size-full"
                src={imgImage3}
              />
              <div className="absolute bg-gradient-to-b from-[23.978%] from-[rgba(0,0,0,0)] inset-0 rounded-[10px] to-[rgba(0,0,0,0.6)]" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute left-[252px] size-[24px] top-[159px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Bg" />
        </svg>
        <Group8 />
      </div>
      <Location8 />
      <Time4 />
      <p
        className="[word-break:break-word] absolute font-['Metropolis:Semi_Bold',sans-serif] leading-[normal] left-[259px] not-italic text-[16px] text-white top-[234px] whitespace-nowrap"
        dir="auto"
      >
        Race Name
      </p>
    </div>
  );
}

function Ic14() {
  return (
    <div
      className="absolute flex inset-[33.33%_41.67%] items-center justify-center"
      style={{ containerType: "size" }}
    >
      <div className="flex-none h-[100cqw] rotate-90 w-[100cqh]">
        <div className="relative size-full" data-name="Ic">
          <div className="absolute inset-[-15%_-7.5%]">
            <svg
              className="block size-full"
              fill="none"
              height="5.2"
              preserveAspectRatio="none"
              viewBox="0 0 9.2 5.2"
              width="9.2"
            >
              <g id="Ic">
                <path
                  d="M0.6 4.6L4.6 0.6L8.6 4.6"
                  id="Stroke 1"
                  stroke="#3EDDA4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.2"
                />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function IcTitle() {
  return (
    <div className="absolute contents left-[76px] top-[160px]" data-name="Ic + Title">
      <div className="-translate-x-1/2 -translate-y-full [word-break:break-word] absolute flex flex-col font-['Abel:Regular',sans-serif] justify-end leading-[0] left-[109px] not-italic text-[#3edda4] text-[13px] text-center top-[179px] whitespace-nowrap">
        <p className="leading-[normal]" dir="auto">
          Manage Race
        </p>
      </div>
      <div className="absolute left-[160px] size-[24px] top-[160px]" data-name="Ic">
        <Ic14 />
      </div>
    </div>
  );
}

function Button() {
  return (
    <div className="absolute contents left-[16px] top-[154px]" data-name="Button">
      <div
        className="absolute h-[36px] left-[16px] rounded-tl-[8px] rounded-tr-[8px] top-[154px] w-[219px]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(62, 221, 164, 0.17) 0%, rgba(62, 221, 164, 0.17) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)",
        }}
        data-name="Bg"
      />
      <IcTitle />
    </div>
  );
}

function Ic15() {
  return (
    <div className="absolute inset-[22.97%_12.5%_23.01%_12.5%]" data-name="Ic">
      <div className="absolute inset-[-6.61%_-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="8.56292"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 8.56292"
          width="11.5"
        >
          <g id="Ic">
            <path
              d="M10.125 3.11771V4.86771"
              id="Vector"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.25 3.99271H11"
              id="Vector_2"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p2bcfa4f2}
              id="Vector_3"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.p3b8bbc80}
              id="Vector_4"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Location9() {
  return (
    <div className="absolute contents left-[28px] top-[275px]" data-name="Location">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[50px] not-italic text-[11px] text-white top-[276px] whitespace-nowrap"
        dir="auto"
      >
        Stage 12
      </p>
      <div className="absolute left-[28px] overflow-clip size-[14px] top-[275px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="bg" />
        </svg>
        <Ic15 />
      </div>
    </div>
  );
}

function Group10() {
  return (
    <div className="absolute inset-[12.5%]" data-name="Group">
      <div className="absolute inset-[-4.76%]">
        <svg
          className="block size-full"
          fill="none"
          height="11.5"
          preserveAspectRatio="none"
          viewBox="0 0 11.5 11.5"
          width="11.5"
        >
          <g id="Group">
            <path
              d={svgPaths.pc5b3680}
              id="Vector"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={svgPaths.pbb83980}
              id="Vector_2"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Time5() {
  return (
    <div className="absolute contents left-[28px] top-[258px]" data-name="Time">
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[50px] not-italic text-[11px] text-white top-[259px] whitespace-nowrap"
        dir="auto"
      >
        9:00 am - 6:30 pm
      </p>
      <div className="absolute left-[28px] overflow-clip size-[14px] top-[258px]" data-name="Ic">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Vector" />
        </svg>
        <Group10 />
      </div>
    </div>
  );
}

function Text4() {
  return (
    <div className="absolute contents left-[28px] top-[234px]" data-name="Text">
      <Location9 />
      <Time5 />
      <p
        className="[word-break:break-word] absolute font-['Metropolis:Semi_Bold',sans-serif] leading-[normal] left-[28px] not-italic text-[16px] text-white top-[234px] whitespace-nowrap"
        dir="auto"
      >
        Race Name
      </p>
    </div>
  );
}

function Card5() {
  return (
    <div className="absolute contents left-[16px] top-[154px]" data-name="Card / 1">
      <div className="absolute flex h-[147px] items-center justify-center left-[16px] top-[154px] w-[219px]">
        <div className="-scale-y-100 flex-none rotate-180">
          <div className="h-[147px] relative rounded-[10px] w-[219px]" data-name="Image">
            <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[10px]">
              <img
                alt=""
                className="absolute max-w-none object-cover rounded-[10px] size-full"
                src={imgImage4}
              />
              <div className="absolute bg-gradient-to-b from-[23.978%] from-[rgba(0,0,0,0)] inset-0 rounded-[10px] to-[rgba(0,0,0,0.6)]" />
            </div>
          </div>
        </div>
      </div>
      <Button />
      <Text4 />
    </div>
  );
}

function Today() {
  return (
    <div className="absolute contents left-[16px] top-[126px]" data-name="Today">
      <Card4 />
      <Card5 />
      <p
        className="[word-break:break-word] absolute font-['Abel:Regular',sans-serif] leading-[normal] left-[16px] not-italic text-[#293042] text-[16px] top-[126px] whitespace-nowrap"
        dir="auto"
      >
        My Races (12)
      </p>
    </div>
  );
}

function Ic16() {
  return (
    <div className="absolute contents inset-[4.17%]" data-name="Ic">
      <div className="absolute inset-[12.5%] rounded-[64px]" data-name="Image">
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[64px]">
          <img
            alt=""
            className="absolute h-[223.16%] left-[-6.42%] max-w-none top-[-36.08%] w-[148.78%]"
            src={imgImage5}
          />
        </div>
      </div>
      <div className="absolute inset-[4.17%]" data-name="Frame">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="36.6667"
          preserveAspectRatio="none"
          viewBox="0 0 36.6667 36.6667"
          width="36.6667"
        >
          <circle cx="18.3333" cy="18.3333" id="Frame" r="17.8333" stroke="#63A6FC" />
        </svg>
      </div>
    </div>
  );
}

function Ic18() {
  return (
    <div className="absolute bottom-1/4 left-[12.5%] right-[12.5%] top-1/4" data-name="Ic">
      <div className="absolute inset-[-5%_-3.33%]">
        <svg
          className="block size-full"
          fill="none"
          height="13.2"
          preserveAspectRatio="none"
          viewBox="0 0 19.2 13.2"
          width="19.2"
        >
          <g id="Ic">
            <path
              d="M0.6 0.6H18.6"
              id="Vector"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d="M14.6 6.6H0.6"
              id="Vector_2"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
            <path
              d="M0.6 12.6H10.6"
              id="Vector_3"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Ic17() {
  return (
    <div
      className="absolute bottom-1/4 contents left-[4.27%] right-[89.33%] top-1/4"
      data-name="Ic"
    >
      <div
        className="absolute bottom-1/4 left-[4.27%] overflow-clip right-[89.33%] top-1/4"
        data-name="Ic"
      >
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="32"
          preserveAspectRatio="none"
          viewBox="0 0 32 32"
          width="32"
        >
          <g id="Bg" />
        </svg>
        <Ic18 />
      </div>
    </div>
  );
}

function Ic19() {
  return (
    <div className="absolute contents left-[4px] top-[3px]" data-name="Ic">
      <div className="absolute inset-[16.67%]" data-name="Stroke 1">
        <div className="absolute inset-[-3.75%]">
          <svg
            className="block size-full"
            fill="none"
            height="17.1999"
            preserveAspectRatio="none"
            viewBox="0 0 17.2001 17.1999"
            width="17.2001"
          >
            <path
              d={svgPaths.p14592b00}
              id="Stroke 1"
              stroke="#293042"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.2"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Message() {
  return (
    <div
      className="absolute bottom-1/4 contents left-[76.53%] right-[17.07%] top-1/4"
      data-name="Message"
    >
      <div className="absolute bottom-1/4 left-[76.53%] right-[17.07%] top-1/4" data-name="Ic">
        <Ic19 />
      </div>
      <div className="absolute inset-[31.25%_17.2%_54.17%_80.93%]">
        <svg
          className="absolute block inset-0 size-full"
          fill="none"
          height="7"
          preserveAspectRatio="none"
          viewBox="0 0 7 7"
          width="7"
        >
          <circle cx="3.5" cy="3.5" fill="#63A6FC" id="Ellipse 6" r="3" stroke="white" />
        </svg>
      </div>
    </div>
  );
}

function StatusIcons() {
  return (
    <div
      className="absolute content-stretch flex gap-[4px] items-center right-[12px] top-[16px]"
      data-name="Status Icons"
    >
      <div className="h-[14px] relative shrink-0 w-[20px]" data-name="Network Signal / Light">
        <div className="absolute inset-[28.57%_30%_14.29%_55%]" data-name="Path">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="8"
            preserveAspectRatio="none"
            viewBox="0 0 3 8"
            width="3"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p383d5700}
              fill="#293042"
              fillRule="evenodd"
              id="Path"
            />
          </svg>
        </div>
        <div className="absolute inset-[42.86%_52.5%_14.29%_32.5%]" data-name="Path">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="6"
            preserveAspectRatio="none"
            viewBox="0 0 3 6"
            width="3"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p28546400}
              fill="#293042"
              fillRule="evenodd"
              id="Path"
            />
          </svg>
        </div>
        <div
          className="absolute bottom-[14.29%] left-[10%] right-3/4 top-[53.57%]"
          data-name="Path"
        >
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="4.5"
            preserveAspectRatio="none"
            viewBox="0 0 3 4.5"
            width="3"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p129e3f40}
              fill="#293042"
              fillRule="evenodd"
              id="Path"
            />
          </svg>
        </div>
        <div className="absolute inset-[14.29%_7.5%_14.29%_77.5%]" data-name="Empty Bar">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="10"
            preserveAspectRatio="none"
            viewBox="0 0 3 10"
            width="3"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p3636b500}
              fill="white"
              fillOpacity="0.18"
              fillRule="evenodd"
              id="Empty Bar"
            />
          </svg>
        </div>
        <div className="absolute inset-[28.57%_30%_14.29%_55%]" data-name="Path">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="8"
            preserveAspectRatio="none"
            viewBox="0 0 3 8"
            width="3"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p383d5700}
              fill="#293042"
              fillRule="evenodd"
              id="Path"
            />
          </svg>
        </div>
        <div className="absolute inset-[42.86%_52.5%_14.29%_32.5%]" data-name="Path">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="6"
            preserveAspectRatio="none"
            viewBox="0 0 3 6"
            width="3"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p28546400}
              fill="#293042"
              fillRule="evenodd"
              id="Path"
            />
          </svg>
        </div>
        <div
          className="absolute bottom-[14.29%] left-[10%] right-3/4 top-[53.57%]"
          data-name="Path"
        >
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="4.5"
            preserveAspectRatio="none"
            viewBox="0 0 3 4.5"
            width="3"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p129e3f40}
              fill="#293042"
              fillRule="evenodd"
              id="Path"
            />
          </svg>
        </div>
      </div>
      <div className="h-[14px] relative shrink-0 w-[16px]" data-name="WiFi Signal / Light">
        <div className="absolute inset-[63.85%_35.56%_14.29%_37.11%]" data-name="Path">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="3.06041"
            preserveAspectRatio="none"
            viewBox="0 0 4.37186 3.06041"
            width="4.37186"
          >
            <path d={svgPaths.p1da632f0} fill="#293042" id="Path" />
          </svg>
        </div>
        <div className="absolute inset-[39.07%_20.1%_37.26%_21.66%]" data-name="Path">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="3.31425"
            preserveAspectRatio="none"
            viewBox="0 0 9.3198 3.31425"
            width="9.3198"
          >
            <path d={svgPaths.p2307b100} fill="#293042" id="Path" />
          </svg>
        </div>
        <div className="absolute inset-[14.29%_4.69%_54.84%_6.25%]" data-name="Path">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="4.32259"
            preserveAspectRatio="none"
            viewBox="0 0 14.25 4.32259"
            width="14.25"
          >
            <path d={svgPaths.p392f1a00} fill="#293042" id="Path" />
          </svg>
        </div>
      </div>
      <div className="h-[14px] relative shrink-0 w-[25px]" data-name="Battery / Light">
        <div className="absolute h-[4px] left-[24px] top-[5px] w-px">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="4"
            preserveAspectRatio="none"
            viewBox="0 0 1 4"
            width="1"
          >
            <path d={svgPaths.p16442180} fill="#293042" id="Rectangle 23" />
          </svg>
        </div>
        <div className="absolute h-[12px] left-0 top-px w-[23px]" data-name="Rectangle 21 (Stroke)">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="12"
            preserveAspectRatio="none"
            viewBox="0 0 23 12"
            width="23"
          >
            <path
              clipRule="evenodd"
              d={svgPaths.p48c4400}
              fill="#293042"
              fillRule="evenodd"
              id="Rectangle 21 (Stroke)"
            />
          </svg>
        </div>
        <div className="-translate-y-1/2 absolute bg-[#293042] h-[8px] left-[2px] rounded-[1px] top-1/2 w-[19px]" />
      </div>
    </div>
  );
}

function TimeLight() {
  return (
    <div
      className="-translate-x-1/2 -translate-y-1/2 absolute h-[15px] left-[calc(50%-159px)] top-[calc(50%+0.5px)] w-[33px]"
      data-name="Time / Light"
    >
      <svg
        className="absolute block inset-0 size-full"
        fill="none"
        height="15"
        preserveAspectRatio="none"
        viewBox="0 0 33 15"
        width="33"
      >
        <g id="Time / Light">
          <g id="9:41">
            <path d={svgPaths.p309cf100} fill="#293042" />
            <path d={svgPaths.p1285b880} fill="#293042" />
            <path d={svgPaths.pa9bea00} fill="#293042" />
            <path d={svgPaths.p1d3f77f0} fill="#293042" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function TopBar() {
  return (
    <div className="absolute contents left-0 top-0" data-name="Top Bar">
      <div
        className="absolute bg-white h-[102px] left-0 rounded-bl-[16px] rounded-br-[16px] shadow-[0px_4px_4px_0px_rgba(41,48,66,0.02)] top-0 w-[375px]"
        data-name="Bg"
      />
      <div className="absolute h-[48px] left-0 top-[44px] w-[375px]" data-name="Top Bar / Header">
        <div className="[word-break:break-word] absolute flex flex-col font-['Abel:Regular',sans-serif] inset-[33.33%_36.67%] justify-center leading-[0] lowercase not-italic text-[#63a6fc] text-[16px] text-center whitespace-nowrap">
          <p className="leading-[normal]">Commissaire</p>
        </div>
        <div className="absolute inset-[8.33%_4.27%_8.33%_85.07%]" data-name="Ic">
          <svg
            className="absolute block inset-0 size-full"
            fill="none"
            height="32"
            preserveAspectRatio="none"
            viewBox="0 0 32 32"
            width="32"
          >
            <g id="Bg" />
          </svg>
          <Ic16 />
        </div>
        <Ic17 />
        <Message />
      </div>
      <div
        className="absolute h-[44px] left-0 overflow-clip top-0 w-[375px]"
        data-name="Top Bar / Status Bar"
      >
        <div className="absolute h-[44px] left-0 top-0 w-[375px]" data-name="Bg" />
        <Notch className="absolute h-[30px] left-0 right-0 top-0" />
        <StatusIcons />
        <Indicator className="absolute right-[71px] size-[6px] top-[8px]" />
        <TimeLight />
      </div>
    </div>
  );
}

export default function RaceList() {
  return (
    <div
      className="bg-white relative shadow-[0px_4px_40px_0px_rgba(0,0,0,0.1)] size-full"
      data-name="Race List: 1-1"
    >
      <div className="absolute bg-[#f6f8fa] h-[812px] left-0 top-0 w-[375px]" data-name="Bg" />
      <AllRaces />
      <Today />
      <TopBar />
    </div>
  );
}
