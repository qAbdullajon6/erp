/// Curated city dataset keyed by ISO 3166-1 alpha-2 country code.
/// Cities are stored and transmitted as plain name strings (same representation
/// as the existing Customer.city field). A later geocoding pass can attach
/// coordinates to entries already in the database.
///
/// Coverage: Central Asian logistics markets are exhaustive; other countries
/// include major cities suitable for freight/logistics routing.
export interface City {
  name: string;    // stored in DB and displayed in UI
  country: string; // ISO alpha-2 — matches the parent key, kept for convenience
}

/// Returns the cities for a country, or an empty array if unknown.
export function citiesForCountry(countryCode: string | null | undefined): City[] {
  if (!countryCode) return [];
  return (CITIES_BY_COUNTRY[countryCode.toUpperCase()] ?? []).map((name) => ({
    name,
    country: countryCode.toUpperCase(),
  }));
}

/// Flat city list for a country, sorted as provided (primary cities first).
export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  // ── Central Asia (primary market) ────────────────────────────────────────
  UZ: [
    'Tashkent', 'Samarkand', 'Bukhara', 'Namangan', 'Andijan',
    'Fergana', 'Nukus', 'Navoi', 'Qarshi', 'Jizzakh',
    'Termez', 'Urgench', 'Guliston', 'Margilan', 'Chirchiq',
    'Angren', 'Kokand', 'Navoiy', 'Bekabad', 'Kagan',
  ],
  KZ: [
    'Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Aktobe',
    'Taraz', 'Pavlodar', 'Ust-Kamenogorsk', 'Semey', 'Oral',
    'Atyrau', 'Kostanay', 'Kyzylorda', 'Petropavl', 'Aktau',
    'Temirtau', 'Taldykorgan', 'Ekibastuz', 'Rudny', 'Zhanaozen',
  ],
  KG: [
    'Bishkek', 'Osh', 'Jalal-Abad', 'Karakol', 'Tokmok',
    'Uzgen', 'Kara-Balta', 'Balykchy', 'Naryn', 'Isfana',
    'Batken', 'Kan', 'Nookat', 'Kochkor-Ata', 'Tash-Kumyr',
  ],
  TJ: [
    'Dushanbe', 'Khujand', 'Kulob', 'Bokhtar', 'Istaravshan',
    'Vahdat', 'Panjakent', 'Tursunzoda', 'Isfara', 'Konibodom',
    'Khorugh', 'Farkhor', 'Qurghonteppa', 'Rogun', 'Hisor',
  ],
  TM: [
    'Ashgabat', 'Turkmenabat', 'Daşoguz', 'Mary', 'Balkanabat',
    'Bayramaly', 'Tejen', 'Serdar', 'Türkmenbaşy', 'Gowurdak',
    'Yolöten', 'Sarahs', 'Gazojak', 'Farap',
  ],
  AF: [
    'Kabul', 'Kandahar', 'Herat', 'Mazar-i-Sharif', 'Kunduz',
    'Jalalabad', 'Lashkargah', 'Taloqan', 'Ghazni', 'Puli Khumri',
    'Baghlan', 'Bamyan', 'Farah', 'Zaranj',
  ],

  // ── Russia ─────────────────────────────────────────────────────────────
  RU: [
    'Moscow', 'Saint Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Kazan',
    'Chelyabinsk', 'Omsk', 'Samara', 'Rostov-on-Don', 'Ufa',
    'Krasnoyarsk', 'Volgograd', 'Perm', 'Voronezh', 'Saratov',
    'Krasnodar', 'Tyumen', 'Tolyatti', 'Izhevsk', 'Barnaul',
    'Vladivostok', 'Irkutsk', 'Khabarovsk', 'Yaroslavl', 'Orenburg',
    'Tomsk', 'Kemerovo', 'Astrakhan', 'Novokuznetsk', 'Ryazan',
  ],

  // ── Turkey ──────────────────────────────────────────────────────────────
  TR: [
    'Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Adana',
    'Gaziantep', 'Konya', 'Antalya', 'Mersin', 'Kayseri',
    'Diyarbakır', 'Eskişehir', 'Samsun', 'Trabzon', 'Malatya',
    'Erzurum', 'Van', 'Gebze', 'İzmit', 'Elazığ',
  ],

  // ── Iran ────────────────────────────────────────────────────────────────
  IR: [
    'Tehran', 'Mashhad', 'Isfahan', 'Karaj', 'Tabriz',
    'Shiraz', 'Ahvaz', 'Qom', 'Kermanshah', 'Urmia',
    'Zahedan', 'Rasht', 'Kerman', 'Arak', 'Hamadan',
    'Yazd', 'Ardabil', 'Bandar Abbas', 'Qazvin', 'Zanjan',
  ],

  // ── China ───────────────────────────────────────────────────────────────
  CN: [
    'Beijing', 'Shanghai', 'Chongqing', 'Guangzhou', 'Shenzhen',
    'Tianjin', 'Wuhan', 'Chengdu', 'Nanjing', 'Hangzhou',
    'Shenyang', 'Harbin', 'Xi\'an', 'Qingdao', 'Dalian',
    'Urumqi', 'Kunming', 'Lanzhou', 'Guiyang', 'Nanning',
    'Hefei', 'Fuzhou', 'Jinan', 'Changsha', 'Zhengzhou',
    'Xiamen', 'Changchun', 'Ürümqi', 'Kashgar', 'Hohhot',
  ],

  // ── India ───────────────────────────────────────────────────────────────
  IN: [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai',
    'Kolkata', 'Ahmedabad', 'Pune', 'Surat', 'Jaipur',
    'Lucknow', 'Kanpur', 'Nagpur', 'Visakhapatnam', 'Bhopal',
    'Patna', 'Ludhiana', 'Agra', 'Nashik', 'Varanasi',
    'New Delhi', 'Gurgaon', 'Noida', 'Chandigarh', 'Amritsar',
  ],

  // ── Germany ─────────────────────────────────────────────────────────────
  DE: [
    'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt',
    'Stuttgart', 'Düsseldorf', 'Dortmund', 'Essen', 'Leipzig',
    'Bremen', 'Dresden', 'Hanover', 'Nuremberg', 'Duisburg',
    'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Mannheim',
  ],

  // ── United Kingdom ──────────────────────────────────────────────────────
  GB: [
    'London', 'Birmingham', 'Manchester', 'Leeds', 'Glasgow',
    'Liverpool', 'Sheffield', 'Edinburgh', 'Bristol', 'Cardiff',
    'Leicester', 'Coventry', 'Bradford', 'Nottingham', 'Belfast',
    'Southampton', 'Newcastle', 'Brighton', 'Reading', 'Derby',
  ],

  // ── United States ───────────────────────────────────────────────────────
  US: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
    'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
    'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
    'Indianapolis', 'San Francisco', 'Seattle', 'Denver', 'Nashville',
    'Oklahoma City', 'El Paso', 'Washington', 'Boston', 'Memphis',
    'Portland', 'Las Vegas', 'Detroit', 'Atlanta', 'Miami',
  ],

  // ── UAE ─────────────────────────────────────────────────────────────────
  AE: [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman',
    'Ras al-Khaimah', 'Fujairah', 'Umm al-Quwain', 'Jebel Ali',
  ],

  // ── Saudi Arabia ────────────────────────────────────────────────────────
  SA: [
    'Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam',
    'Taif', 'Tabuk', 'Buraidah', 'Khobar', 'Hofuf',
    'Jubail', 'Abha', 'Hail', 'Najran', 'Yanbu',
  ],

  // ── Pakistan ────────────────────────────────────────────────────────────
  PK: [
    'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad',
    'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala',
    'Hyderabad', 'Bahawalpur', 'Sargodha', 'Sukkur', 'Larkana',
  ],

  // ── Azerbaijan ──────────────────────────────────────────────────────────
  AZ: [
    'Baku', 'Ganja', 'Sumqayit', 'Mingachevir', 'Nakhchivan',
    'Shirvan', 'Lankaran', 'Shaki', 'Yevlakh', 'Khachmaz',
  ],

  // ── Georgia ─────────────────────────────────────────────────────────────
  GE: [
    'Tbilisi', 'Kutaisi', 'Batumi', 'Rustavi', 'Zugdidi',
    'Gori', 'Telavi', 'Kobuleti', 'Akhaltsikhe', 'Poti',
  ],

  // ── Armenia ─────────────────────────────────────────────────────────────
  AM: [
    'Yerevan', 'Gyumri', 'Vanadzor', 'Abovyan', 'Vagharshapat',
    'Hrazdan', 'Kapan', 'Charentsavan', 'Goris', 'Sevan',
  ],

  // ── Ukraine ─────────────────────────────────────────────────────────────
  UA: [
    'Kyiv', 'Kharkiv', 'Odesa', 'Dnipro', 'Donetsk',
    'Zaporizhzhia', 'Lviv', 'Kryvyi Rih', 'Mykolaiv', 'Mariupol',
    'Luhansk', 'Vinnytsia', 'Makiivka', 'Simferopol', 'Sevastopol',
    'Khmelnytskyi', 'Cherkasy', 'Chernivtsi', 'Poltava', 'Zhytomyr',
  ],

  // ── Belarus ─────────────────────────────────────────────────────────────
  BY: [
    'Minsk', 'Gomel', 'Mogilev', 'Vitebsk', 'Grodno',
    'Brest', 'Bobruisk', 'Baranavichy', 'Borisov', 'Pinsk',
  ],

  // ── Poland ──────────────────────────────────────────────────────────────
  PL: [
    'Warsaw', 'Kraków', 'Łódź', 'Wrocław', 'Poznań',
    'Gdańsk', 'Szczecin', 'Bydgoszcz', 'Lublin', 'Katowice',
    'Białystok', 'Gdynia', 'Częstochowa', 'Radom', 'Sosnowiec',
  ],

  // ── France ──────────────────────────────────────────────────────────────
  FR: [
    'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice',
    'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille',
    'Rennes', 'Reims', 'Le Havre', 'Saint-Étienne', 'Toulon',
    'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Villeurbanne',
  ],

  // ── Italy ───────────────────────────────────────────────────────────────
  IT: [
    'Rome', 'Milan', 'Naples', 'Turin', 'Palermo',
    'Genoa', 'Bologna', 'Florence', 'Bari', 'Catania',
    'Venice', 'Verona', 'Messina', 'Padua', 'Trieste',
    'Brescia', 'Taranto', 'Reggio Calabria', 'Modena', 'Prato',
  ],

  // ── Spain ───────────────────────────────────────────────────────────────
  ES: [
    'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza',
    'Málaga', 'Murcia', 'Palma', 'Las Palmas', 'Bilbao',
    'Alicante', 'Córdoba', 'Valladolid', 'Vigo', 'Gijón',
    'A Coruña', 'Granada', 'Elche', 'Oviedo', 'Badalona',
  ],

  // ── Netherlands ─────────────────────────────────────────────────────────
  NL: [
    'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven',
    'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen',
    'Enschede', 'Haarlem', 'Arnhem', 'Zaandam', 'Haarlemmermeer',
  ],

  // ── Belgium ─────────────────────────────────────────────────────────────
  BE: [
    'Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liège',
    'Bruges', 'Namur', 'Leuven', 'Mons', 'Aalst',
  ],

  // ── Sweden ──────────────────────────────────────────────────────────────
  SE: [
    'Stockholm', 'Gothenburg', 'Malmö', 'Uppsala', 'Västerås',
    'Örebro', 'Linköping', 'Helsingborg', 'Jönköping', 'Norrköping',
  ],

  // ── Norway ──────────────────────────────────────────────────────────────
  NO: [
    'Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Drammen',
    'Fredrikstad', 'Kristiansand', 'Tromsø', 'Ålesund', 'Sandnes',
  ],

  // ── Switzerland ─────────────────────────────────────────────────────────
  CH: [
    'Zurich', 'Geneva', 'Basel', 'Bern', 'Lausanne',
    'Winterthur', 'Lucerne', 'St. Gallen', 'Lugano', 'Biel',
  ],

  // ── Austria ─────────────────────────────────────────────────────────────
  AT: [
    'Vienna', 'Graz', 'Linz', 'Salzburg', 'Innsbruck',
    'Klagenfurt', 'Wels', 'Villach', 'St. Pölten', 'Dornbirn',
  ],

  // ── Czech Republic ──────────────────────────────────────────────────────
  CZ: [
    'Prague', 'Brno', 'Ostrava', 'Plzeň', 'Liberec',
    'Olomouc', 'České Budějovice', 'Hradec Králové', 'Zlín', 'Kladno',
  ],

  // ── Romania ─────────────────────────────────────────────────────────────
  RO: [
    'Bucharest', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța',
    'Craiova', 'Brașov', 'Galați', 'Ploiești', 'Oradea',
    'Brăila', 'Bacău', 'Arad', 'Pitești', 'Sibiu',
  ],

  // ── Bulgaria ────────────────────────────────────────────────────────────
  BG: [
    'Sofia', 'Plovdiv', 'Varna', 'Burgas', 'Stara Zagora',
    'Ruse', 'Pleven', 'Sliven', 'Dobrich', 'Shumen',
  ],

  // ── Greece ──────────────────────────────────────────────────────────────
  GR: [
    'Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Larissa',
    'Volos', 'Ioannina', 'Chania', 'Chalcis', 'Kavala',
  ],

  // ── Turkey (included above) — already has TR

  // ── Japan ───────────────────────────────────────────────────────────────
  JP: [
    'Tokyo', 'Yokohama', 'Osaka', 'Nagoya', 'Sapporo',
    'Kobe', 'Kyoto', 'Fukuoka', 'Kawasaki', 'Saitama',
    'Hiroshima', 'Sendai', 'Kitakyushu', 'Chiba', 'Sakai',
    'Kumamoto', 'Okayama', 'Sagamihara', 'Hamamatsu', 'Shizuoka',
  ],

  // ── South Korea ─────────────────────────────────────────────────────────
  KR: [
    'Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon',
    'Gwangju', 'Ulsan', 'Suwon', 'Changwon', 'Goyang',
    'Seongnam', 'Yongin', 'Bucheon', 'Jeonju', 'Ansan',
  ],

  // ── Malaysia ────────────────────────────────────────────────────────────
  MY: [
    'Kuala Lumpur', 'George Town', 'Ipoh', 'Shah Alam', 'Petaling Jaya',
    'Johor Bahru', 'Kuching', 'Kota Kinabalu', 'Subang Jaya', 'Klang',
  ],

  // ── Singapore ───────────────────────────────────────────────────────────
  SG: ['Singapore'],

  // ── Thailand ────────────────────────────────────────────────────────────
  TH: [
    'Bangkok', 'Nonthaburi', 'Pak Kret', 'Hat Yai', 'Chiang Mai',
    'Udon Thani', 'Nakhon Ratchasima', 'Pattaya', 'Rayong', 'Khon Kaen',
  ],

  // ── Vietnam ─────────────────────────────────────────────────────────────
  VN: [
    'Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Can Tho', 'Bien Hoa',
    'Hue', 'Nha Trang', 'Haiphong', 'Vung Tau', 'Thu Duc',
  ],

  // ── Australia ───────────────────────────────────────────────────────────
  AU: [
    'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide',
    'Gold Coast', 'Newcastle', 'Canberra', 'Sunshine Coast', 'Wollongong',
    'Geelong', 'Hobart', 'Townsville', 'Cairns', 'Darwin',
  ],

  // ── Canada ──────────────────────────────────────────────────────────────
  CA: [
    'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton',
    'Ottawa', 'Mississauga', 'Winnipeg', 'Quebec City', 'Hamilton',
    'Brampton', 'Surrey', 'Halifax', 'London', 'Markham',
  ],

  // ── Brazil ──────────────────────────────────────────────────────────────
  BR: [
    'São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza',
    'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Goiânia',
    'Porto Alegre', 'Belém', 'Guarulhos', 'Campinas', 'São Luís',
  ],

  // ── Mexico ──────────────────────────────────────────────────────────────
  MX: [
    'Mexico City', 'Ecatepec', 'Guadalajara', 'Puebla', 'Juárez',
    'Tijuana', 'León', 'Monterrey', 'Zapopan', 'Nezahualcóyotl',
    'Culiacán', 'Mérida', 'Acapulco', 'Chihuahua', 'Naucalpan',
  ],

  // ── South Africa ────────────────────────────────────────────────────────
  ZA: [
    'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth',
    'Bloemfontein', 'East London', 'Vereeniging', 'Pietermaritzburg', 'Soweto',
  ],

  // ── Egypt ───────────────────────────────────────────────────────────────
  EG: [
    'Cairo', 'Alexandria', 'Giza', 'Shubra El-Kheima', 'Port Said',
    'Suez', 'Luxor', 'Aswan', 'Mansura', 'El-Mahalla El-Kubra',
    'Tanta', 'Asyut', 'Ismailia', 'Fayyum', 'Zagazig',
  ],

  // ── Nigeria ─────────────────────────────────────────────────────────────
  NG: [
    'Lagos', 'Kano', 'Ibadan', 'Abuja', 'Port Harcourt',
    'Benin City', 'Maiduguri', 'Zaria', ' Kaduna', 'Enugu',
  ],

  // ── Ethiopia ────────────────────────────────────────────────────────────
  ET: [
    'Addis Ababa', 'Dire Dawa', 'Mekelle', 'Gondar', 'Bahir Dar',
    'Hawassa', 'Adama', 'Jimma', 'Harar', 'Dilla',
  ],

  // ── Kenya ───────────────────────────────────────────────────────────────
  KE: [
    'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret',
    'Thika', 'Malindi', 'Kitale', 'Garissa', 'Kakamega',
  ],

  // ── Other countries — capitals / major cities only ────────────────────
  AD: ['Andorra la Vella'],
  AG: ['Saint John\'s'],
  AL: ['Tirana', 'Durrës', 'Vlorë', 'Shkodër', 'Fier'],
  AO: ['Luanda', 'Huambo', 'Lobito', 'Benguela', 'Namibe'],
  AR: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata'],
  BA: ['Sarajevo', 'Banja Luka', 'Tuzla', 'Mostar', 'Zenica'],
  BB: ['Bridgetown'],
  BD: ['Dhaka', 'Chittagong', 'Sylhet', 'Rajshahi', 'Khulna'],
  BF: ['Ouagadougou', 'Bobo-Dioulasso'],
  BH: ['Manama', 'Riffa', 'Muharraq'],
  BI: ['Bujumbura', 'Muyinga'],
  BJ: ['Cotonou', 'Porto-Novo', 'Parakou'],
  BN: ['Bandar Seri Begawan'],
  BO: ['Sucre', 'La Paz', 'Cochabamba', 'Santa Cruz'],
  BS: ['Nassau'],
  BT: ['Thimphu', 'Phuntsholing'],
  BW: ['Gaborone', 'Francistown'],
  BZ: ['Belmopan', 'Belize City'],
  CD: ['Kinshasa', 'Lubumbashi', 'Kisangani'],
  CF: ['Bangui'],
  CG: ['Brazzaville', 'Pointe-Noire'],
  CI: ['Abidjan', 'Bouaké', 'Yamoussoukro'],
  CL: ['Santiago', 'Valparaíso', 'Concepción', 'Antofagasta'],
  CM: ['Yaoundé', 'Douala', 'Garoua'],
  CO: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena'],
  CR: ['San José', 'Cartago', 'Liberia'],
  CU: ['Havana', 'Santiago de Cuba', 'Camagüey'],
  CV: ['Praia', 'Mindelo'],
  CY: ['Nicosia', 'Limassol', 'Larnaca', 'Paphos'],
  DJ: ['Djibouti'],
  DK: ['Copenhagen', 'Aarhus', 'Odense', 'Aalborg'],
  DM: ['Roseau'],
  DO: ['Santo Domingo', 'Santiago', 'San Pedro de Macorís'],
  DZ: ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Blida'],
  EC: ['Quito', 'Guayaquil', 'Cuenca', 'Ambato'],
  EE: ['Tallinn', 'Tartu', 'Narva', 'Pärnu'],
  ER: ['Asmara', 'Keren'],
  FI: ['Helsinki', 'Espoo', 'Tampere', 'Vantaa', 'Oulu'],
  FJ: ['Suva', 'Lautoka'],
  GA: ['Libreville', 'Port-Gentil'],
  GD: ['Saint George\'s'],
  GH: ['Accra', 'Kumasi', 'Tamale', 'Takoradi'],
  GM: ['Banjul', 'Serekunda'],
  GN: ['Conakry', 'Nzérékoré'],
  GQ: ['Malabo', 'Bata'],
  GT: ['Guatemala City', 'Mixco', 'Villa Nueva'],
  GW: ['Bissau'],
  GY: ['Georgetown'],
  HN: ['Tegucigalpa', 'San Pedro Sula'],
  HR: ['Zagreb', 'Split', 'Rijeka', 'Osijek'],
  HT: ['Port-au-Prince', 'Cap-Haïtien'],
  HU: ['Budapest', 'Debrecen', 'Miskolc', 'Pécs', 'Győr'],
  ID: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar'],
  IE: ['Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford'],
  IL: ['Jerusalem', 'Tel Aviv', 'Haifa', 'Rishon LeZion', 'Petah Tikva'],
  IQ: ['Baghdad', 'Mosul', 'Basra', 'Erbil', 'Kirkuk', 'Najaf'],
  IS: ['Reykjavík', 'Kópavogur', 'Hafnarfjörður'],
  JM: ['Kingston', 'Montego Bay', 'Portmore'],
  JO: ['Amman', 'Zarqa', 'Irbid', 'Aqaba'],
  KH: ['Phnom Penh', 'Siem Reap', 'Battambang'],
  KI: ['South Tarawa'],
  KM: ['Moroni'],
  KN: ['Basseterre'],
  KP: ['Pyongyang', 'Hamhung', 'Chongjin'],
  KW: ['Kuwait City', 'Salmiya', 'Hawalli'],
  LA: ['Vientiane', 'Savannakhet', 'Luang Prabang'],
  LB: ['Beirut', 'Tripoli', 'Sidon', 'Tyre'],
  LC: ['Castries'],
  LI: ['Vaduz', 'Schaan'],
  LK: ['Colombo', 'Kandy', 'Galle', 'Jaffna'],
  LR: ['Monrovia', 'Gbarnga'],
  LS: ['Maseru', 'Teyateyaneng'],
  LT: ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai'],
  LU: ['Luxembourg City', 'Esch-sur-Alzette'],
  LV: ['Riga', 'Daugavpils', 'Liepāja', 'Jēkabpils'],
  LY: ['Tripoli', 'Benghazi', 'Misrata', 'Tobruk'],
  MA: ['Casablanca', 'Rabat', 'Fez', 'Marrakesh', 'Agadir', 'Tangier'],
  MC: ['Monaco'],
  MD: ['Chișinău', 'Bălți', 'Tiraspol'],
  ME: ['Podgorica', 'Nikšić', 'Bar'],
  MG: ['Antananarivo', 'Toamasina', 'Antsirabe'],
  MH: ['Majuro'],
  MK: ['Skopje', 'Bitola', 'Kumanovo'],
  ML: ['Bamako', 'Sikasso', 'Mopti'],
  MM: ['Naypyidaw', 'Yangon', 'Mandalay', 'Bago'],
  MN: ['Ulaanbaatar', 'Erdenet', 'Darkhan'],
  MR: ['Nouakchott', 'Nouadhibou'],
  MT: ['Valletta', 'Birkirkara', 'Qormi'],
  MU: ['Port Louis', 'Beau Bassin-Rose Hill'],
  MV: ['Malé'],
  MW: ['Lilongwe', 'Blantyre', 'Mzuzu'],
  MZ: ['Maputo', 'Beira', 'Nampula'],
  NA: ['Windhoek', 'Rundu', 'Walvis Bay'],
  NE: ['Niamey', 'Zinder', 'Maradi'],
  NI: ['Managua', 'Matagalpa', 'León'],
  NP: ['Kathmandu', 'Pokhara', 'Patan', 'Biratnagar'],
  NR: ['Yaren'],
  NZ: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga'],
  OM: ['Muscat', 'Salalah', 'Sohar', 'Nizwa'],
  PA: ['Panama City', 'San Miguelito', 'Colón'],
  PE: ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Cusco'],
  PG: ['Port Moresby', 'Lae', 'Mount Hagen'],
  PH: ['Manila', 'Quezon City', 'Davao', 'Caloocan', 'Cebu City'],
  PT: ['Lisbon', 'Porto', 'Braga', 'Amadora', 'Setúbal'],
  PW: ['Ngerulmud'],
  PY: ['Asunción', 'Ciudad del Este', 'San Lorenzo'],
  QA: ['Doha', 'Al Rayyan', 'Al Wakrah'],
  RS: ['Belgrade', 'Novi Sad', 'Niš', 'Kragujevac'],
  RW: ['Kigali', 'Butare', 'Gitarama'],
  SB: ['Honiara'],
  SC: ['Victoria'],
  SD: ['Khartoum', 'Omdurman', 'Port Sudan'],
  SI: ['Ljubljana', 'Maribor', 'Celje', 'Kranj'],
  SK: ['Bratislava', 'Košice', 'Prešov', 'Žilina'],
  SL: ['Freetown', 'Bo', 'Kenema'],
  SM: ['San Marino'],
  SN: ['Dakar', 'Touba', 'Thiès'],
  SO: ['Mogadishu', 'Hargeisa', 'Bosaso'],
  SR: ['Paramaribo'],
  SS: ['Juba', 'Wau', 'Malakal'],
  ST: ['São Tomé'],
  SV: ['San Salvador', 'Santa Ana', 'Soyapango'],
  SY: ['Damascus', 'Aleppo', 'Homs', 'Latakia'],
  SZ: ['Mbabane', 'Manzini'],
  TD: ['N\'Djamena', 'Moundou', 'Sarh'],
  TG: ['Lomé', 'Sokodé', 'Kara'],
  TL: ['Dili'],
  TN: ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte'],
  TO: ['Nukuʻalofa'],
  TT: ['Port of Spain', 'San Fernando', 'Chaguanas'],
  TV: ['Funafuti'],
  TW: ['Taipei', 'Kaohsiung', 'Taichung', 'Tainan', 'Hsinchu'],
  TZ: ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma'],
  UG: ['Kampala', 'Gulu', 'Lira', 'Mbarara'],
  UY: ['Montevideo', 'Salto', 'Paysandú'],
  VA: ['Vatican City'],
  VC: ['Kingstown'],
  VE: ['Caracas', 'Maracaibo', 'Barquisimeto', 'Valencia'],
  VU: ['Port Vila'],
  WS: ['Apia'],
  XK: ['Pristina', 'Prizren', 'Ferizaj'],
  YE: ['Sanaa', 'Aden', 'Taiz', 'Hodeidah'],
  ZM: ['Lusaka', 'Ndola', 'Kitwe', 'Livingstone'],
  ZW: ['Harare', 'Bulawayo', 'Chitungwiza', 'Mutare'],
};
