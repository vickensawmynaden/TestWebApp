namespace WebApplication7.Models
{
    using System;
    using System.Data.Entity;
    using System.ComponentModel.DataAnnotations.Schema;
    using System.Linq;

    public partial class MainDbContext : DbContext
    {
        public MainDbContext()
            : base("name=MainDbContext")
        {
        }

        public virtual DbSet<Person> People { get; set; }

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
        }
    }
}
