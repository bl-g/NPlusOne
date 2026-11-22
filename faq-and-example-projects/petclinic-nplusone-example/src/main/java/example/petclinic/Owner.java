package example.petclinic;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;

@Entity
class Owner {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @OneToMany(mappedBy = "owner", cascade = CascadeType.ALL)
    private List<Pet> pets = new ArrayList<>();

    protected Owner() {
    }

    Owner(
            String name) {
        this.name = name;
    }

    void addPet(
            Pet pet) {
        pets.add(pet);
        pet.setOwner(this);
    }

    Long getId() {
        return id;
    }

    String getName() {
        return name;
    }

    List<Pet> getPets() {
        return pets;
    }
}
