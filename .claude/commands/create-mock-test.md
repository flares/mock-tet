# create-mock-test

You are creating a new mock exam JSON file for the Mock TET repository. Read this entire file before doing anything else — it is your complete reference for syllabus, schema, and workflow.

---

## Step-by-step workflow

1. **Parse the user's request** — determine which sections/subjects are wanted and whether it's a full test or mini-test.
2. **Read `exams/manifest.json`** to see existing exams and avoid duplicate IDs.
3. **Generate a unique exam ID** using the pattern `<type>-<subjects>-<nn>` (e.g. `paper2-math-sci-01`, `paper2-mini-cdp-math-01`).
4. **Write questions** for each requested section, following the syllabus below. Every question must be factually accurate.
5. **Write the JSON file** to `exams/<exam-id>.json` using the schema below.
6. **Update `exams/manifest.json`** — add the new entry to the `exams` array.
7. **Confirm** — tell the user the file is ready, which sections are in it, total questions, and duration.

---

## Mini-test logic

When the user asks for a subset (e.g. "just Maths and CDP", "Science only"):
- Include **only the requested sections** — omit the others entirely.
- Set `duration` = `sum(questionCount per section) × 1` minute (1 min per mark, same as real exam).  
  Example: CDP (30 Qs) + Math (30 Qs) = 60 questions → 60 minutes.
- The `duration` field in the JSON is the **source of truth** — the exam timer reads from it.
- Set `type` to `"Mini-Test"` and note the included sections in `subtitle`.

---

## Full Paper 2 structure (official CTET)

| Section | Questions | Marks | Duration contribution |
|---|---|---|---|
| Child Development & Pedagogy (CDP) | 30 | 30 | 30 min |
| Language I | 30 | 30 | 30 min |
| Language II | 30 | 30 | 30 min |
| Mathematics & Science (combined) | 60 | 60 | 60 min |
| **Total** | **150** | **150** | **150 min** |

Within Mathematics & Science:
- Mathematics: 30 questions (≈20 content + ≈10 pedagogy)
- Science: 30 questions (≈20 content + ≈10 pedagogy)

No negative marking. 1 mark per question.

---

## Section IDs and `startIndex` values (full Paper 2)

```
cdp      startIndex: 0    questionCount: 30
lang1    startIndex: 30   questionCount: 30
lang2    startIndex: 60   questionCount: 30
math     startIndex: 90   questionCount: 30
science  startIndex: 120  questionCount: 30
```

For mini-tests, recalculate `startIndex` sequentially starting from 0.

---

## Complete CTET Paper 2 Syllabus

### A. Child Development & Pedagogy (CDP) — 30 Questions

**Child Development (15 questions)**
- Concept of development; relationship between growth and development; principles of development
- Influence of Heredity and Environment on development
- Stages of development: infancy, childhood, adolescence — physical, cognitive, emotional, social, moral
- Piaget's theory of cognitive development (4 stages; schema, assimilation, accommodation)
- Vygotsky's socio-cultural theory; Zone of Proximal Development (ZPD); scaffolding
- Kohlberg's theory of moral development (6 stages, 3 levels)
- Howard Gardner's Multiple Intelligences (8 intelligences)
- Erikson's psychosocial stages
- Language development; Chomsky's Language Acquisition Device (LAD)
- Concept of Intelligence; theories of intelligence (Spearman's g factor, Thurstone's primary abilities)
- Emotional intelligence; Social and emotional learning
- Gender as a social construct; gender roles; gender-biased education
- Individual differences among learners; understanding diversity in learning styles
- Adolescence: characteristics, problems, peer influence, identity formation

**Inclusive Education — Understanding Children with Special Needs (5 questions)**
- Concepts of diversity, disability, and inclusion
- Types of disabilities: intellectual (formerly mental retardation), learning disability (dyslexia, dyscalculia, dysgraphia, ADHD), hearing impairment, visual impairment, autism spectrum disorder, cerebral palsy
- Inclusive classroom strategies; Universal Design for Learning (UDL)
- Rights of children with disabilities; RTE Act 2009; Disabilities Act
- Role of teacher in an inclusive classroom

**Learning and Pedagogy (10 questions)**
- How children think and learn; how and why children fail to achieve success in school
- Theories of learning: Behaviourism (Pavlov, Skinner — classical and operant conditioning), Constructivism (Bruner, Piaget), Social Learning Theory (Bandura)
- Motivation: intrinsic vs extrinsic; Maslow's hierarchy of needs
- Factors affecting learning: attention, memory, perception, emotion
- Formative vs summative assessment; Continuous and Comprehensive Evaluation (CCE)
- Critical thinking; problem-solving; creative thinking
- Child-centred education; activity-based learning; collaborative learning
- Role of language and cognition in learning
- Teaching-learning strategies for diverse learners
- National curriculum framework (NCF 2005) and its key recommendations
- New Education Policy (NEP 2020): key aspects relevant to upper primary

---

### B. Language I — 30 Questions

**Reading Comprehension (15 questions)**
- Two unseen passages (narrative/discursive/literary) followed by inference, vocabulary, and comprehension questions

**Pedagogy of Language Development (15 questions)**
- Principles of language learning and acquisition (Krashen's Monitor Model, Input Hypothesis)
- Difference between language acquisition and language learning
- Role of listening, speaking, reading and writing (LSRW) in language development
- Methods of teaching language: Communicative Language Teaching (CLT), Direct Method, Grammar-Translation
- Reading: decoding, fluency, comprehension strategies; reading for meaning
- Writing: process writing, drafting, revising; creative writing
- Grammar: functional grammar in context (not prescriptive rules)
- Role of home language/L1 in learning L2
- Challenges of teaching language in a diverse multilingual classroom
- Evaluation of language: formative tools (portfolio, observation, peer assessment)
- Remedial teaching in language

---

### C. Language II — 30 Questions

Same structure as Language I (different language). Typically English as Language II.

**Reading Comprehension (15 questions)**
- Two passages; questions on comprehension, inference, vocabulary in context, tone

**Pedagogy of Language Development (15 questions)**
- All same pedagogy topics as Language I applied to English as a second/third language

---

### D. Mathematics — 30 Questions (content ≈20, pedagogy ≈10)

#### Content Topics

**Number System**
- Knowing our Numbers: Integers — positive and negative; absolute value; number line
- Playing with Numbers: Divisibility rules (2, 3, 4, 5, 6, 8, 9, 10, 11); LCM and HCF (Euclid's algorithm for HCF)
- Whole Numbers, Natural Numbers and their properties
- Fractions: types (proper, improper, mixed), operations, comparison
- Rational Numbers: definition, representation on number line, operations, standard form
- Decimals: terminating and non-terminating decimals; conversion between fractions and decimals
- Exponents and Powers: laws of exponents; scientific notation
- **Class 9–10 extension:** Real Numbers (Euclid's division lemma and algorithm; irrational numbers √2, √3 proof; decimal expansion of rationals)

**Algebra**
- Introduction to Algebra: variables, constants, algebraic expressions
- Ratio and Proportion; Unitary Method; Direct and Inverse proportion
- Algebraic Expressions: like/unlike terms; addition, subtraction, multiplication, division
- Identities: (a+b)², (a-b)², (a+b)(a-b), (a+b+c)², (a+b)³, (a-b)³, a³+b³, a³-b³
- Factorisation: common factor, grouping, difference of squares, trinomials
- Linear Equations in One Variable: solution, applications in word problems
- Linear Equations in Two Variables: graphical and algebraic solution; system of equations
- **Class 9–10 extension:** Polynomials (degree, coefficients, remainder theorem, factor theorem, zeros); Quadratic Equations (discriminant, nature of roots, quadratic formula, sum/product of roots); Arithmetic Progressions (nth term, sum formula)

**Geometry**
- Basic geometrical ideas: points, lines, angles (types), intersecting and parallel lines, transversal
- Triangles: properties (angle sum, exterior angle, triangle inequality); congruence (SSS, SAS, ASA, RHS, AAS); similarity (AA, SAS, SSS)
- Quadrilaterals: types (square, rectangle, rhombus, parallelogram, trapezium, kite); properties; angle sum
- Circles: radius, diameter, chord, arc, sector, segment; central and inscribed angles; tangent and its properties
- Polygons: regular/irregular; interior/exterior angle sum formulae
- Symmetry: line symmetry and rotational symmetry; order of symmetry
- Visualising 3D shapes: nets; Euler's formula (V + F = E + 2)
- Construction: bisectors, triangles, quadrilaterals using ruler and compass
- **Class 9–10 extension:** Coordinate Geometry (distance formula, section formula, mid-point, slope, collinearity); Trigonometry (sin, cos, tan definitions, identities, complementary angles, heights and distances)

**Mensuration**
- Perimeter and area of: square, rectangle, parallelogram, triangle, trapezium, rhombus, circle
- Area of combined shapes; area of paths
- Surface area and volume of: cube, cuboid, cylinder, cone, sphere, hemisphere, frustum
- Conversion of units; real-life applications
- **Class 9–10 extension:** Heron's formula; surface area and volume of complex 3D figures; conversion of solids

**Data Handling**
- Collection, organisation and representation of data: tally marks, frequency distribution tables
- Bar graphs, double bar graphs, histograms, pie/circle charts, line graphs
- Measures of central tendency: mean (direct method, assumed mean, step deviation), median, mode
- Chance and Probability: experimental vs theoretical; equally likely outcomes; complementary events
- **Class 9–10 extension:** Cumulative frequency (ogive); quartiles; probability of events (addition rule, mutually exclusive); random experiments

#### Pedagogical Issues in Mathematics (≈10 questions)

- Nature of Mathematics: abstract, logical, hierarchical structure; role of conjecture and proof
- Place of Mathematics in the curriculum: its relationship with other subjects
- Language of Mathematics: symbols, terminology, precise communication
- Community Mathematics: mathematics in everyday life; ethnomathematics
- Common student misconceptions and errors in arithmetic, algebra, geometry
- Strategies: constructivist approach; inductive-deductive methods; problem-solving approach; project method
- Use of manipulatives and technology (Geogebra, abacus, Dienes blocks, number strips)
- Evaluation: oral, written, performance-based, diagnostic testing
- Diagnostic and remedial teaching: identifying root causes of errors
- Differentiated instruction for diverse learners in Mathematics

---

### E. Science — 30 Questions (content ≈20, pedagogy ≈10)

#### Content Topics

**Food**
- Sources of food: plant and animal sources; producers, consumers
- Components of food: carbohydrates, proteins, fats, vitamins (A, B-complex, C, D), minerals, water, roughage; deficiency diseases (scurvy, rickets, night blindness, beri-beri, goitre, anaemia)
- Cleaning food: methods of separating mixtures (hand-picking, threshing, winnowing, sieving, sedimentation, decantation, filtration, evaporation, distillation, chromatography)

**Materials**
- Fibre to Fabric: types of fibres (natural: cotton, wool, silk, jute; synthetic: nylon, polyester, acrylic); spinning, weaving, knitting
- Metals and Non-metals: physical and chemical properties; reactivity series; uses
- Acids, Bases and Salts: indicators (litmus, turmeric, phenolphthalein); pH scale; strong/weak acids and bases; salts — preparation, properties; neutralisation; everyday applications
- Materials in Daily Use: glass, ceramics, cement; plastics (thermoplastics vs thermosetting); synthetic vs natural polymers
- **Class 9–10 extension:** Atoms and Molecules (law of conservation of mass, definite proportions, Dalton's atomic theory, molar mass, Avogadro's number); Structure of Atom (Thomson, Rutherford, Bohr models; atomic number; mass number; isotopes; electron configuration); Carbon and its Compounds (covalent bonding; homologous series; functional groups; IUPAC naming; ethanol and ethanoic acid; soaps and detergents); Periodic Classification (Dobereiner, Newlands, Mendeleev, Modern periodic table; trends)

**The World of the Living**
- Cell: structure of plant and animal cell; organelles and their functions (nucleus, mitochondria, chloroplast, ER, Golgi, ribosome, vacuole, lysosome); prokaryotic vs eukaryotic
- Organization: cell → tissue → organ → organ system → organism; types of tissues (epithelial, connective, muscular, nervous in animals; meristematic, permanent in plants)
- Microorganisms: bacteria, viruses, fungi, protozoa, algae; useful and harmful microorganisms; disease and immunity; food preservation
- Human Body: digestive system; respiratory system (cellular vs pulmonary respiration); circulatory system (heart, blood, blood groups, blood pressure); excretory system (kidney structure, urine formation); skeletal and muscular systems
- Reproduction: asexual (binary fission, budding, spore formation, vegetative propagation, fragmentation); sexual reproduction in flowering plants (pollination, fertilisation, seed dispersal); human reproduction; adolescence and puberty (hormonal changes, secondary sexual characters)
- Reaching the Age of Adolescence: physical changes; hormones; reproductive health; menstruation; AIDS; POCSO awareness
- Ecosystems: food chains and food webs; trophic levels; energy flow; producers, consumers, decomposers; biotic and abiotic factors; types of ecosystems
- Diversity in Living Organisms: five-kingdom classification; vertebrates and invertebrates; adaptations of animals and plants to habitat
- **Class 9–10 extension:** Life Processes (autotrophic vs heterotrophic nutrition; photosynthesis — light/dark reactions; respiration — aerobic/anaerobic, ATP; transportation — xylem, phloem, heart valves; excretion — nephron, dialysis); Control and Coordination (neurons, reflex arc, CNS/PNS, brain regions; endocrine system — glands and hormones, feedback); Heredity and Evolution (Mendel's laws, monohybrid/dihybrid cross, dominance; DNA as genetic material; natural selection; evolution evidence; speciation; human evolution); Our Environment (biodegradable vs non-biodegradable; ozone layer; waste management)

**Moving Things, People and Ideas — Force, Motion and Energy**
- Motion: types of motion (linear, circular, oscillatory); measurement of time and distance; speed, velocity, acceleration; distance-time and velocity-time graphs
- Force: contact and non-contact forces; effects of force; friction (types, factors, useful and harmful friction, reducing friction)
- Simple Machines: lever (3 classes), pulley, wheel and axle, inclined plane, screw, wedge; mechanical advantage
- Work, Energy, Power: definition; relationship; kinetic and potential energy; conservation of mechanical energy; renewable and non-renewable energy
- Sound: production; propagation; longitudinal waves; frequency, amplitude, wavelength, speed; reflection (echo); noise vs music; hearing range; noise pollution
- Light: rectilinear propagation; reflection (laws, plane and curved mirrors — image formation, sign convention); refraction (Snell's law, optical density, refractive index, total internal reflection); prism and dispersion; rainbow; lenses (convex/concave — image formation, lens formula); human eye (defects: myopia, hypermetropia, presbyopia, astigmatism — corrective lenses); power of lens
- **Class 9–10 extension:** Laws of Motion (Newton's 3 laws, inertia, momentum, impulse, friction); Gravitation (universal law, g, free fall, mass vs weight, buoyancy, Archimedes' principle, floatation); Electricity (Ohm's law, resistance, resistivity; series and parallel circuits; power, energy, heating effect; domestic electric circuits, safety); Magnetic Effects of Current (Oersted's experiment; electromagnet; Fleming's left hand rule; electric motor; Faraday's electromagnetic induction; electric generator; AC vs DC)

**Natural Phenomena**
- Rain: water cycle; condensation and evaporation; types of rainfall
- Thunder and Lightning: electrostatic charges; lightning conductors; safety measures
- Earthquakes: seismic waves; Richter scale; seismic zones; safety measures
- **Class 9–10 extension:** Light (detailed as above); Reflection and Refraction (covered under light)

**Natural Resources**
- Air: composition; oxygen cycle; nitrogen cycle; air pollution — sources, effects, control
- Water: importance; water cycle; water pollution — sources, effects, control; water conservation; rainwater harvesting
- Soil: formation; layers (horizons); soil types; soil erosion; conservation; microorganisms in soil
- Coal and Petroleum: formation; fractions of petroleum (LPG, petrol, kerosene, diesel, lubricants, paraffin, bitumen); fossil fuels as non-renewable; combustion
- Forests: importance; deforestation — causes and consequences; conservation
- Conservation of Natural Resources: 3Rs (Reduce, Reuse, Recycle); Wildlife protection; biosphere reserves; national parks; sanctuaries
- **Class 9–10 extension:** Our Environment (ecosystems in detail, ozone depletion, greenhouse effect, global warming); Management of Natural Resources (Chipko movement, water management — dams controversy, sustainability)

#### Pedagogical Issues in Science (≈10 questions)

- Nature and Structure of Sciences: scientific method; hypothesis; observation; experimentation; objectivity; falsifiability
- Aims and objectives of science education: scientific temper; curiosity; problem-solving; environmental awareness
- Approaches to science teaching: inductive, deductive, inquiry-based, project-based, integrated
- Observation and experimentation: importance in learning science; lab skills; designing experiments
- Concept mapping; analogical reasoning; use of models and simulations
- Common misconceptions in science (e.g. weight vs mass, conduction in metals, photosynthesis at night, evolution as progress)
- Text material and learning aids: textbooks, lab manuals, charts, models, ICT tools
- Evaluation in science: laboratory work assessment; observation skills; MCQs vs open-ended questions; rubrics
- Formative assessment strategies: think-pair-share, exit tickets, concept cartoons
- Remedial teaching: identifying conceptual gaps; reteaching strategies
- Science and Society: environmental education; STEM integration; gender equity in science

---

## JSON Schema (complete reference)

```json
{
  "id": "<exam-id>",
  "title": "<Full title>",
  "titleHindi": "<Hindi title>",
  "type": "Paper 2" | "Mini-Test",
  "conductingBody": "Central Board of Secondary Education",
  "conductingBodyHindi": "केन्द्रीय माध्यमिक शिक्षा बोर्ड",
  "duration": <integer minutes>,
  "totalMarks": <integer — equals total questions>,
  "negativeMarking": false,
  "marksPerQuestion": 1,
  "instructions": ["...", "..."],
  "instructionsHindi": ["...", "..."],
  "sections": [
    {
      "id": "<section-id>",
      "name": "<English name>",
      "nameHindi": "<Hindi name>",
      "shortName": "<tab label>",
      "questionCount": <integer>,
      "startIndex": <cumulative count from previous sections>
    }
  ],
  "questions": [
    {
      "id": "q<n>",
      "sectionId": "<section-id>",
      "globalIndex": <0-based integer across ALL questions>,
      "text": "<Question in English>",
      "textHindi": "<Question in Hindi>",
      "options": [
        { "key": "A", "text": "<Option A>", "textHindi": "<Option A Hindi>" },
        { "key": "B", "text": "<Option B>", "textHindi": "<Option B Hindi>" },
        { "key": "C", "text": "<Option C>", "textHindi": "<Option C Hindi>" },
        { "key": "D", "text": "<Option D>", "textHindi": "<Option D Hindi>" }
      ],
      "correctAnswer": "A" | "B" | "C" | "D",
      "explanation": "<Why this answer is correct>",
      "explanationHindi": "<Explanation in Hindi>"
    }
  ]
}
```

Critical rules:
- `globalIndex` must be a zero-based integer sequential across the ENTIRE exam (not per-section).
- `startIndex` in each section = sum of `questionCount` of all preceding sections.
- `totalMarks` = total number of questions.
- `duration` in minutes = total questions (1 minute per mark) for standard tests.

---

## Question writing rules

1. **Factual accuracy first** — every content question must be verifiably correct per NCERT textbooks (classes 6–10).
2. **One clearly correct answer** — distractors should be plausible but unambiguously wrong.
3. **Pedagogy questions** test teaching knowledge, not content. They should reference specific pedagogical approaches, learning theories, or assessment strategies.
4. **Difficulty spread**: aim for ≈40% easy, ≈40% medium, ≈20% hard within each section.
5. **No trick questions** — the real TET exam tests genuine knowledge, not word traps.
6. **Hindi translations**: provide accurate Hindi for question text and all options. If unsure of exact Hindi phrasing for a technical term, keep the English term and add हिंदी context around it.
7. **Unique questions**: before writing, check the existing JSON files in `exams/` to avoid repeating questions from previous tests.
8. **Explanations**: every question needs a brief, educational explanation (1–2 sentences) that would help a candidate understand why the answer is correct.

---

## Manifest entry format

After writing the JSON file, add this entry to the `exams` array in `exams/manifest.json`:

```json
{
  "id": "<exam-id>",
  "title": "<Full title as shown on card>",
  "subtitle": "<Comma-separated list of included sections>",
  "type": "Paper 2" | "Mini-Test",
  "targetClasses": "Classes VI–VIII (+ IX–X extension)" | "<custom>",
  "duration": <same as JSON>,
  "totalQuestions": <same as JSON>,
  "totalMarks": <same as in JSON>,
  "negativeMarking": false,
  "file": "exams/<exam-id>.json"
}
```

---

## Example invocations

| User says | What to do |
|---|---|
| "Create a new mock test" | Full Paper 2: CDP + Lang I + Lang II + Maths + Science, 150 Qs, 150 min |
| "Create a mini test for Maths only" | Maths section only, 30 Qs, 30 min |
| "Mini test for CDP and Science" | CDP (30) + Science (30), 60 Qs, 60 min, startIndex recalculated |
| "Create a Paper 2 Math Science test" | CDP + Lang I + Lang II + Maths + Science (full Paper 2 format) |
| "Quick test for pedagogy topics" | CDP (30 Qs focused on pedagogy sub-topics), 30 min |
| "New test, focus on class 10 science topics" | Full Paper 2 but Science questions drawn from class 9–10 extension topics |
