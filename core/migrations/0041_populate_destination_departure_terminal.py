from django.db import migrations


def populate_destination_departure_terminal(apps, schema_editor):
    Destination = apps.get_model('core', 'Destination')
    Terminal = apps.get_model('core', 'Terminal')
    terminal = Terminal.objects.filter(name='Calinan').first()
    if terminal is None:
        raise RuntimeError(
            "Cannot populate Destination.departure_terminal: Terminal named 'Calinan' does not exist."
        )

    Destination.objects.update(departure_terminal=terminal)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0040_add_destination_departure_terminal'),
    ]

    operations = [
        migrations.RunPython(
            populate_destination_departure_terminal,
            migrations.RunPython.noop,
        ),
    ]