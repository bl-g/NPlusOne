# Tiny PetClinic N+1 example

A deliberately small, backend-only Spring Boot application for demonstrating an NPlusOne. It has no authentication, frontend, or external database: H2 is populated with six owners, two pets per owner, and two visits per pet at startup.

Run it from the repository root:

```powershell
.\gradlew.bat :petclinic-nplusone-example:bootRun
```

Then open these URLs directly in a browser:

- `http://localhost:8080/` lists the endpoints.
- `http://localhost:8080/api/owners` triggers one N+1 pattern: owners -> pets.
- `http://localhost:8080/api/owners/visit-history` triggers two N+1 patterns: owners -> pets and pets -> visits.
- `http://localhost:8080/api/owners/summaries` loads owners and pets in one query, as a comparison.

The example uses named methods and ordinary loops throughout, including startup data loading, so its application frames have no generated lambda names. Directory loading, owner mapping, pet profiles and visit histories give the queries realistic, longer call paths.

The deliberate lazy loads are in `OwnerResponseMapper` and `VisitHistoryMapper`. The application path for a pets query is:

```text
OwnerController.ownersVisitHistory
  -> ClinicQueryService.ownersVisitHistory
  -> ClinicQueryService.buildOwnerDirectory
  -> OwnerResponseMapper.toResponses
  -> OwnerResponseMapper.toResponse
  -> OwnerResponseMapper.createPetProfiles
  -> OwnerResponseMapper.mapPets
  -> SQL: pets for one owner
```

For the nested endpoint, the visits query continues through `OwnerResponseMapper.toPetResponse`, `VisitHistoryMapper.toDescriptions` and `VisitHistoryMapper.describeVisits`. Iterating each lazy collection triggers its query. The owner summaries endpoint still fetches owners and pets together and does not load visits.

To display those frames in NPlusOne, configure `nplusone.stacktrace.application-package-prefixes=example.petclinic` when starting the application with the Java agent. Framework-generated proxy frames can be hidden with the frontend's `nplusone.ui.hide-proxy-frames` setting, which defaults to `true`.
