export type MarketingEventCatalogEntry = {
  eventCatalogId: string;
  categoryId: string;
  categoryName: string;
  subcategoryName?: string;
  eventName: string;
  audienceLevels: string[];
};

type CatalogGroup = readonly [categoryId: string, categoryName: string, events: readonly string[], subcategoryName?: string, audienceLevels?: readonly string[]];

const schoolLevels = ["Under 14", "Under 17", "Under 19", "College"];
const entries: CatalogGroup[] = [
  ["sports", "Sports", "Cricket|Football|Basketball|Volleyball|Kabaddi|Kho-Kho|Throwball|Hockey|Handball|Badminton|Table Tennis|Tennis|Athletics|Chess|Carrom".split("|"), undefined, schoolLevels],
  ["academics", "Academics & Education", "Mathematics|Physics|Chemistry|Biology|Computer Science|English|Tamil|Hindi|Social Science|History|Geography|Economics|Accountancy|Business Studies".split("|"), "Subjects"],
  ["academics", "Academics & Education", "IIT / JEE Coaching|NEET Coaching|Maths Olympiad|Science Olympiad|Maths Quiz|Science Quiz|Academic Quiz|Science Exhibition|Science Fair|Project Exhibition|Model Making|Subject Competition|Academic Workshop|Educational Seminar".split("|"), "Academic Preparation & Activities"],
  ["technology", "Technology & Innovation", "Coding|Coding Competition|Hackathon|Robotics|Robotics Competition|Artificial Intelligence|Machine Learning|App Development|Web Development|Technical Quiz|Technical Exhibition|Innovation Challenge|Ideathon|Tech Fest|Project Presentation".split("|")],
  ["dance", "Dance", "Bharatanatyam|Kathak|Kuchipudi|Classical Dance|Folk Dance|Western Dance|Contemporary Dance|Solo Dance|Group Dance|Choreography".split("|")],
  ["music", "Music", "Vocal|Singing|Classical Vocal|Carnatic Music|Hindustani Music|Western Music|Folk Music|Light Music|Group Song|Instrumental|Instrumental Music|Keyboard|Guitar|Violin|Flute|Tabla|Mridangam|Veena|Drums".split("|")],
  ["drama-performing-arts", "Drama & Performing Arts", "Drama|One-Act Play|Skit|Mime|Mimicry|Street Play / Nukkad Natak|Theatre|Puppetry|Storytelling|Talent Show".split("|")],
  ["fine-arts", "Fine Arts & Creative Activities", "Drawing|Painting|Sketching|Poster Making|Collage|Clay Modelling|Cartooning|Craft|Handicrafts|Rangoli|Kolam|Mehndi|Pottery|Photography".split("|")],
  ["literary-language", "Literary & Language", "Debate|Elocution|Essay Writing|Speech|Poetry|Poetry Recitation|Story Writing|Storytelling|Creative Writing|Extempore|Spell Bee|Literary Quiz".split("|")],
  ["quiz-knowledge", "Quiz & Knowledge", "General Knowledge Quiz|Current Affairs Quiz|Science Quiz|Maths Quiz|Sports Quiz|History Quiz|India Quiz|Business Quiz|Literature Quiz|General Quiz".split("|")],
  ["skill-development", "Skill Development", "Spoken English|Public Speaking|Communication Skills|Presentation Skills|Group Discussion|Leadership Skills|Team Building|Problem Solving|Critical Thinking|Creativity|Time Management|Decision Making|Personality Development|Life Skills".split("|")],
  ["career-job-skills", "Career & Job Skills", "Career Guidance|Career Counselling|Job Skills Training|Aptitude Training|Mock Interview|Resume Building|Interview Preparation|Placement Training|Internship Fair|Job Fair|Career Fair|Industry Talk|Guest Lecture|Entrepreneurship".split("|")],
  ["health-wellness", "Health, Fitness & Wellness", "Yoga|Yogasana|Meditation|Fitness|Aerobics|Zumba|Physical Fitness|Fitness Competition|Health Camp|Health Checkup|First Aid|Mental Wellness|Personal Hygiene|Health Awareness".split("|")],
  ["cooking-food", "Cooking & Food", "No-Fire Cooking|Healthy Food Competition|Salad Making|Sandwich Making|Fruit Decoration|Food Decoration|Food Exhibition|Traditional Food Exhibition|Food Workshop".split("|")],
  ["environment-nature", "Environment & Nature", "Tree Plantation|Planting Activity|Gardening|School Garden|Campus Cleanliness|Beach Clean-up|Lake Clean-up|Recycling|Waste Management|Plastic-Free Campaign|Water Conservation|Environmental Awareness|Eco Club Activity|Nature Walk".split("|")],
  ["social-service", "Social Service & Community", "Community Service|Volunteering|Charity Drive|Donation Drive|Food Donation|Blood Donation|Literacy Drive|Community Outreach|Helping Others|Cleanliness Drive|Social Awareness Campaign|Village Outreach|NSS Activities|NCC Activities".split("|")],
  ["educational-trips", "Educational Trips & Outdoor Activities", "Educational Trip|Industrial Visit|Museum Visit|Science Centre Visit|Historical Site Visit|College Visit|Field Visit|Nature Trip|Educational Tour|Heritage Visit|Trekking|Camping".split("|")],
  ["school-college-events", "School & College Events", "Annual Day|Sports Day|Cultural Fest|School Fest|College Fest|Technical Fest|Department Fest|Freshers Day|Farewell|Graduation|Orientation|Alumni Meet|Youth Fest|Annual Function".split("|")],
  ["festivals", "Festivals & Celebrations", "Indian Festivals|Pongal|Diwali|Holi|Onam|Navratri|Dussehra|Ganesh Chaturthi|Krishna Janmashtami|Christmas|Eid|Raksha Bandhan".split("|")],
  ["festivals", "Festivals & Celebrations", "Traditional Dress|Fancy Dress|Cultural Dance|Singing|Drama|Rangoli|Kolam|Food Exhibition|Traditional Games|Cultural Competition".split("|"), "Festival Activities"],
  ["national-international-days", "National & International Days", "UN Day|Independence Day|Republic Day|Gandhi Jayanti|Children's Day|Teachers' Day|National Sports Day|National Science Day|National Youth Day|Constitution Day|World Environment Day|International Yoga Day|Women's Day".split("|")],
  ["talent-competitions", "Talent & General Competitions", "Talent Competition|Talent Show|Fancy Dress Competition|Quiz Competition|Singing Competition|Dance Competition|Drawing Competition|Photography Competition|Cultural Competition|Best Out of Waste|Creative Competition|Inter-School Competition|Inter-College Competition".split("|")],
  ["clubs-student-activities", "Clubs & Student Activities", "Sports Club|Cultural Club|Music Club|Dance Club|Literary Club|Science Club|Maths Club|Coding Club|Robotics Club|Photography Club|Eco Club|Debate Club|Entrepreneurship Club|NSS|NCC".split("|")],
  ["scholarships", "Scholarships & Education Support", "Scholarship|Scholarship Awareness|Scholarship Application|Merit Scholarship|Government Scholarship|Education Support|Financial Assistance".split("|")],
];

const slug = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const marketingEventCatalog: MarketingEventCatalogEntry[] = entries.flatMap(([categoryId, categoryName, eventNames, subcategoryName, audienceLevels]) => eventNames.map((eventName) => ({
  eventCatalogId: `${categoryId}-${slug(eventName)}`,
  categoryId,
  categoryName,
  subcategoryName,
  eventName,
  audienceLevels: [...(audienceLevels || [])],
})));

export const legacyEventTypeLabels: Record<string, string> = {
  TASTING_DAY: "Tasting day", PTA_STALL: "PTA stall", CAMPUS_SAMPLING: "Campus sampling", COMMUNITY_TALK: "Community talk", FRANCHISE_LAUNCH: "Franchise launch", OTHER: "Other",
};

export function eventCatalogLabel(eventType: string) {
  const entry = marketingEventCatalog.find((item) => item.eventCatalogId === eventType);
  return entry ? `${entry.categoryName} · ${entry.eventName}` : legacyEventTypeLabels[eventType] || eventType;
}

export function eventCatalogCategories() {
  return [...new Map(marketingEventCatalog.map((item) => [item.categoryId, item.categoryName])).entries()].map(([categoryId, categoryName]) => ({ categoryId, categoryName }));
}
