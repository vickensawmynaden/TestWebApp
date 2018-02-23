namespace WebApplication7.Models
{
    using System;
    using System.Collections.Generic;
    using System.ComponentModel.DataAnnotations;
    using System.ComponentModel.DataAnnotations.Schema;
    using System.Data.Entity.Spatial;

    [Table("Person")]
    public partial class Person
    {
        public int PersonID { get; set; }

        public string PersonFirstName { get; set; }

        public string PersonLastName { get; set; }

        public DateTime? PersonDateOfBirth { get; set; }

        public string PersonGender { get; set; }
    }
}
