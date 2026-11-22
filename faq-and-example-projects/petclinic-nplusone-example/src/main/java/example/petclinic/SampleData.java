package example.petclinic;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
class SampleData implements CommandLineRunner {

    private final OwnerRepository owners;

    SampleData(
            OwnerRepository owners) {
        this.owners = owners;
    }

    @Override
    public void run(
            String... arguments) {
        populateOwners();
    }

    private void populateOwners() {
        for(int ownerNumber = 1; ownerNumber <= 6; ownerNumber++) {
            owners.save(createOwnerWithPets(ownerNumber));
        }
    }

    private Owner createOwnerWithPets(
            int ownerNumber) {
        Owner owner = new Owner("Owner " + ownerNumber);
        for(int petNumber = 1; petNumber <= 2; petNumber++) {
            owner.addPet(createPetWithVisits(ownerNumber, petNumber));
        }
        return owner;
    }

    private Pet createPetWithVisits(
            int ownerNumber,
            int petNumber) {
        Pet pet = new Pet("Pet " + ownerNumber + "-" + petNumber);
        pet.addVisit(new Visit("Vaccination"));
        pet.addVisit(new Visit("Check-up"));
        return pet;
    }
}
