namespace WebApplication7.Models.UpdateModels
{
    using System;
    using System.Data.Entity;
    using System.ComponentModel.DataAnnotations.Schema;
    using System.Linq;

    public partial class RegionDbContext : DbContext
    {
        public RegionDbContext()
            : base("name=RegionDbContext")
        {
        }

        public virtual DbSet<Person> People { get; set; }
        public virtual DbSet<Region> Regions { get; set; }

        protected override void OnModelCreating(DbModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Person>()
                .Property(e => e.PersonFirstName)
                .IsUnicode(false);

            modelBuilder.Entity<Person>()
                .Property(e => e.PersonLastName)
                .IsUnicode(false);

            modelBuilder.Entity<Person>()
                .Property(e => e.PersonGender)
                .IsUnicode(false);

            modelBuilder.Entity<Region>()
                .Property(e => e.RegionName)
                .IsUnicode(false);

            modelBuilder.Entity<Region>()
                .HasMany(e => e.People)
                .WithOptional(e => e.Region)
                .HasForeignKey(e => e.PersonRegionID);
        }
    }
}
